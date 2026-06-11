import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma.service';
import { OpenAiService } from '@ai/openai.service';
import { GeminiService } from '@ai/gemini.service';
import { NutritionDbService } from '@ai/nutrition-db.service';
import { S3Service } from './providers/s3.service';
import { UsersService } from '../users/users.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { CorrectAnalysisDto } from './dto/correct-analysis.dto';
import { AnalysisStatus, MealType, SubscriptionStatus } from '@enums';

const FREE_PLAN_DAILY_LIMIT = 3;

interface ConfidenceLabel {
  label: string;
  color: string;
  showWarning: boolean;
}

function getConfidenceLabel(score: number): ConfidenceLabel {
  if (score >= 0.85) return { label: 'Alta', color: '#10b981', showWarning: false };
  if (score >= 0.65) return { label: 'Media', color: '#f59e0b', showWarning: false };
  return { label: 'Baja', color: '#ef4444', showWarning: true };
}

@Injectable()
export class FoodAnalysisService {
  private readonly logger = new Logger(FoodAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openAiService: OpenAiService,
    private readonly geminiService: GeminiService,
    private readonly nutritionDbService: NutritionDbService,
    private readonly s3Service: S3Service,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Análisis principal ───────────────────────────
  async analyzeImage(
    userId: string,
    imageBuffer: Buffer,
    mimeType: string,
    dto: CreateAnalysisDto,
    userSubscription: string,
  ) {
    // ── Control de límite para plan gratuito
    await this.checkAnalysisLimit(userId, userSubscription);

    // ── Subir imagen a S3
    let imageUrl = '';
    let thumbnailUrl = '';
    let imagePath = '';
    let imageBase64 = '';

    try {
      const uploadResult = await this.s3Service.uploadFoodImage(
        imageBuffer,
        userId,
        mimeType,
      );
      imageUrl = uploadResult.imageUrl;
      thumbnailUrl = uploadResult.thumbnailUrl;
      imagePath = uploadResult.imagePath;
      imageBase64 = await this.s3Service.getBase64(imageBuffer);
    } catch (err: any) {
      this.logger.error(`Error subiendo imagen a S3: ${err.message}`);
      // Continuar con base64 directo si S3 falla (desarrollo local)
      imageBase64 = imageBuffer.toString('base64');
      imageUrl = `data:${mimeType};base64,${imageBase64.substring(0, 50)}...`;
    }

    // ── Crear registro pendiente
    const analysis = await this.prisma.foodAnalysis.create({
      data: {
        userId,
        imageUrl,
        imageThumbnailUrl: thumbnailUrl || null,
        imagePath: imagePath || null,
        status: AnalysisStatus.PROCESSING,
        mealType: dto.mealType || null,
        mealDate: dto.mealDate ? new Date(dto.mealDate) : null,
      },
    });

    // ── Ejecutar análisis IA (con fallback automático)
    try {
      const aiResult = await this.runAiAnalysis(
        imageBase64,
        dto.additionalContext,
      );

      // ── Enriquecer con base de datos nutricional
      const enrichedItems = await this.nutritionDbService.enrichItems(
        aiResult.items,
      );

      // ── Calcular totales
      const totals = enrichedItems.reduce(
        (acc, item) => ({
          calories: acc.calories + item.adjustedCalories,
          protein: acc.protein + item.adjustedProtein,
          carbs: acc.carbs + item.adjustedCarbs,
          fat: acc.fat + item.adjustedFat,
          fiber: acc.fiber + item.adjustedFiber,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      );

      const confidenceInfo = getConfidenceLabel(aiResult.confidenceScore);

      // ── Actualizar análisis con resultados
      const updated = await this.prisma.foodAnalysis.update({
        where: { id: analysis.id },
        data: {
          status: AnalysisStatus.COMPLETED,
          mealName: aiResult.mealName,
          mealDescription: aiResult.mealDescription,
          cookingMethod: aiResult.cookingMethod,
          cuisineType: aiResult.cuisineType,
          confidenceScore: aiResult.confidenceScore,
          confidenceLabel: confidenceInfo.label,
          totalCalories: Math.round(totals.calories),
          totalProtein: Math.round(totals.protein * 10) / 10,
          totalCarbs: Math.round(totals.carbs * 10) / 10,
          totalFat: Math.round(totals.fat * 10) / 10,
          totalFiber: Math.round(totals.fiber * 10) / 10,
          aiModel: aiResult.aiModel || this.configService.get('ai.openai.model'),
          aiProvider: aiResult.aiProvider || 'openai',
          processingTimeMs: aiResult.processingTimeMs,
          rawAiResponse: aiResult.rawResponse as any,
          dbVerified: enrichedItems.some((i) => i.dbVerified),
          dbVerifiedAt: new Date(),
          items: {
            create: enrichedItems.map((item, idx) => ({
              detectedName: item.name,
              detectedNameEs: item.nameEs,
              portionSize: item.portionSizeGrams,
              portionUnit: 'g',
              portionDisplay: item.portionDisplay,
              cookingMethod: item.cookingMethod,
              calories: item.adjustedCalories,
              protein: item.adjustedProtein,
              carbohydrates: item.adjustedCarbs,
              fat: item.adjustedFat,
              fiber: item.adjustedFiber,
              confidenceScore: item.confidenceScore,
              alternativeNames: JSON.stringify(item.alternativeNames || []),
              isMainIngredient: item.isMainIngredient,
              foodItemId: item.foodItemId,
              sortOrder: idx,
            })),
          },
        },
        include: { items: true },
      });

      // ── Actualizar racha si se añade al diario
      if (dto.mealType) {
        await this.usersService.updateStreak(userId).catch(() => null);
      }

      return updated;
    } catch (err: any) {
      this.logger.error(`Error en análisis IA: ${err.message}`, err.stack);

      // Marcar como fallido
      await this.prisma.foodAnalysis.update({
        where: { id: analysis.id },
        data: {
          status: AnalysisStatus.FAILED,
          errorMessage: err.message,
        },
      });

      throw new BadRequestException(
        `No fue posible analizar la imagen: ${err.message}`,
      );
    }
  }

  // ─── Fallback automático OpenAI → Gemini ─────────
  private async runAiAnalysis(imageBase64: string, context?: string) {
    const primaryProvider = this.configService.get<string>(
      'ai.primaryProvider',
      'openai',
    );

    try {
      if (primaryProvider === 'openai') {
        const result = await this.openAiService.analyzeImage(imageBase64, context);
        return { ...result, aiModel: this.configService.get('ai.openai.model'), aiProvider: 'openai' };
      } else {
        const result = await this.geminiService.analyzeImage(imageBase64, context);
        return { ...result, aiModel: this.configService.get('ai.gemini.model'), aiProvider: 'gemini' };
      }
    } catch (primaryErr: any) {
      this.logger.warn(
        `Proveedor primario (${primaryProvider}) falló: ${primaryErr.message}. Usando fallback.`,
      );

      // Intentar con el proveedor alternativo
      try {
        if (primaryProvider === 'openai') {
          const result = await this.geminiService.analyzeImage(imageBase64, context);
          return { ...result, aiModel: this.configService.get('ai.gemini.model'), aiProvider: 'gemini' };
        } else {
          const result = await this.openAiService.analyzeImage(imageBase64, context);
          return { ...result, aiModel: this.configService.get('ai.openai.model'), aiProvider: 'openai' };
        }
      } catch (fallbackErr: any) {
        throw new Error(
          `Ambos proveedores de IA fallaron. Error principal: ${primaryErr.message}`,
        );
      }
    }
  }

  // ─── Límite de análisis plan gratuito ─────────────
  private async checkAnalysisLimit(userId: string, subscriptionStatus: string) {
    const isPremium = (
      [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE] as string[]
    ).includes(subscriptionStatus);

    if (isPremium) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayCount = await this.prisma.foodAnalysis.count({
      where: {
        userId,
        createdAt: { gte: today, lt: tomorrow },
        status: { not: AnalysisStatus.FAILED },
      },
    });

    if (todayCount >= FREE_PLAN_DAILY_LIMIT) {
      throw new ForbiddenException({
        message: `Has alcanzado el límite de ${FREE_PLAN_DAILY_LIMIT} análisis gratuitos por día. Actualiza a Premium para análisis ilimitados.`,
        code: 'DAILY_LIMIT_REACHED',
        limit: FREE_PLAN_DAILY_LIMIT,
      });
    }
  }

  // ─── Obtener análisis ─────────────────────────────
  async getAnalysis(id: string, userId: string) {
    const analysis = await this.prisma.foodAnalysis.findFirst({
      where: { id, userId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        feedback: true,
      },
    });

    if (!analysis) throw new NotFoundException('Análisis no encontrado');
    return analysis;
  }

  // ─── Historial de análisis ────────────────────────
  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.foodAnalysis.findMany({
        where: { userId, status: AnalysisStatus.COMPLETED },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          items: {
            take: 3,
            orderBy: { isMainIngredient: 'desc' },
          },
        },
      }),
      this.prisma.foodAnalysis.count({
        where: { userId, status: AnalysisStatus.COMPLETED },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    };
  }

  // ─── Corrección manual ────────────────────────────
  async correctAnalysis(
    id: string,
    userId: string,
    dto: CorrectAnalysisDto,
  ) {
    const analysis = await this.prisma.foodAnalysis.findFirst({
      where: { id, userId },
      include: { items: true },
    });

    if (!analysis) throw new NotFoundException();

    // Aplicar correcciones a cada ítem
    for (const correction of dto.items) {
      const item = analysis.items.find((i) => i.id === correction.id);
      if (!item) continue;

      // Recalcular nutrición si cambió la porción
      let updateData: any = { userCorrected: true };

      if (correction.portionSize && correction.portionSize !== item.portionSize) {
        const ratio = correction.portionSize / item.portionSize;
        updateData = {
          ...updateData,
          userPortionSize: correction.portionSize,
          portionSize: correction.portionSize,
          calories: Math.round(item.calories * ratio * 10) / 10,
          protein: Math.round(item.protein * ratio * 10) / 10,
          carbohydrates: Math.round(item.carbohydrates * ratio * 10) / 10,
          fat: Math.round(item.fat * ratio * 10) / 10,
          fiber: item.fiber ? Math.round(item.fiber * ratio * 10) / 10 : null,
        };
      }

      if (correction.cookingMethod) {
        updateData.cookingMethod = correction.cookingMethod;
      }

      await this.prisma.foodAnalysisItem.update({
        where: { id: correction.id },
        data: updateData,
      });
    }

    // Recalcular totales
    const updatedItems = await this.prisma.foodAnalysisItem.findMany({
      where: { analysisId: id },
    });

    const totals = updatedItems.reduce(
      (acc, item) => ({
        calories: acc.calories + item.calories,
        protein: acc.protein + item.protein,
        carbs: acc.carbs + item.carbohydrates,
        fat: acc.fat + item.fat,
        fiber: acc.fiber + (item.fiber || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    );

    return this.prisma.foodAnalysis.update({
      where: { id },
      data: {
        userCorrected: true,
        correctedAt: new Date(),
        mealType: dto.mealType || analysis.mealType,
        totalCalories: Math.round(totals.calories),
        totalProtein: Math.round(totals.protein * 10) / 10,
        totalCarbs: Math.round(totals.carbs * 10) / 10,
        totalFat: Math.round(totals.fat * 10) / 10,
        totalFiber: Math.round(totals.fiber * 10) / 10,
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  // ─── Añadir al diario ─────────────────────────────
  async addToDiary(analysisId: string, userId: string, mealType: MealType) {
    const analysis = await this.prisma.foodAnalysis.findFirst({
      where: { id: analysisId, userId },
      include: { items: { include: { foodItem: true } } },
    });

    if (!analysis) throw new NotFoundException();
    if (analysis.status !== AnalysisStatus.COMPLETED) {
      throw new BadRequestException('El análisis no está completo');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Buscar o crear entrada del diario para este tipo de comida hoy
    const existingEntry = await this.prisma.diaryEntry.findFirst({
      where: {
        userId,
        mealType,
        date: { gte: today },
        date_lt: new Date(today.getTime() + 86400000),
      } as any,
    });

    if (existingEntry?.analysisId) {
      throw new BadRequestException(
        'Ya existe un análisis para esta comida hoy',
      );
    }

    // Crear o actualizar la entrada del diario
    const diaryEntry = await this.prisma.diaryEntry.upsert({
      where: {
        userId_date_mealType: {
          userId,
          date: today,
          mealType,
        },
      },
      update: {
        analysisId,
        totalCalories: analysis.totalCalories || 0,
        totalProtein: analysis.totalProtein || 0,
        totalCarbs: analysis.totalCarbs || 0,
        totalFat: analysis.totalFat || 0,
        totalFiber: analysis.totalFiber || 0,
      },
      create: {
        userId,
        date: today,
        mealType,
        analysisId,
        totalCalories: analysis.totalCalories || 0,
        totalProtein: analysis.totalProtein || 0,
        totalCarbs: analysis.totalCarbs || 0,
        totalFat: analysis.totalFat || 0,
        totalFiber: analysis.totalFiber || 0,
      },
    });

    await this.usersService.updateStreak(userId).catch(() => null);

    return diaryEntry;
  }

  // ─── Feedback de usuario sobre precisión ──────────
  async submitFeedback(
    analysisId: string,
    userId: string,
    rating: number,
    comment?: string,
    actualCalories?: number,
  ) {
    const analysis = await this.prisma.foodAnalysis.findFirst({
      where: { id: analysisId, userId },
    });

    if (!analysis) throw new NotFoundException();

    return this.prisma.aiFeedback.upsert({
      where: { analysisId },
      update: { rating, comment, actualCalories },
      create: {
        analysisId,
        userId,
        rating,
        comment,
        actualCalories,
      },
    });
  }
}
