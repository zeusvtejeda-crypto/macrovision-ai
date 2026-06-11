import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma.service';
import { NutritionDbService } from '@ai/nutrition-db.service';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { FoodSource } from '@enums';

@Injectable()
export class NutritionService {
  private readonly logger = new Logger(NutritionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nutritionDb: NutritionDbService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  // ─── Búsqueda de alimentos ────────────────────────
  async searchFoods(query: string, page = 1, limit = 20) {
    const cacheKey = `food_search:${query}:${page}:${limit}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const normalized = query.toLowerCase().trim();
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.foodItem.findMany({
        where: {
          OR: [
            { name: { contains: normalized } },
            { nameEs: { contains: normalized } },
            { brand: { contains: normalized } },
          ],
        },
        orderBy: [
          { verifiedByAdmin: 'desc' },
          { usageCount: 'desc' },
          { confidenceScore: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.foodItem.count({
        where: {
          OR: [
            { name: { contains: normalized } },
            { nameEs: { contains: normalized } },
          ],
        },
      }),
    ]);

    // Si hay pocos resultados locales, buscar en USDA
    let externalResults: any[] = [];
    if (items.length < 5 && this.configService.get('usda.apiKey')) {
      try {
        externalResults = await this.searchUsdaExternal(query, limit - items.length);
      } catch (err: any) {
        this.logger.warn(`USDA search failed: ${err.message}`);
      }
    }

    const result = {
      items: [...items, ...externalResults],
      total: total + externalResults.length,
      page,
      limit,
      totalPages: Math.ceil((total + externalResults.length) / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    };

    await this.cacheManager.set(cacheKey, result, 300); // 5 minutos
    return result;
  }

  // ─── Búsqueda en USDA externa ────────────────────
  private async searchUsdaExternal(query: string, limit: number) {
    const apiKey = this.configService.get<string>('usda.apiKey');
    const baseUrl = this.configService.get<string>('usda.baseUrl');

    const url = `${baseUrl}/foods/search?query=${encodeURIComponent(query)}&pageSize=${limit}&api_key=${apiKey}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) return [];

    const data: any = await response.json();

    return (data.foods || []).map((food: any) => {
      const nutrients = food.foodNutrients || [];
      const getNutrient = (name: string) => {
        const n = nutrients.find((n: any) =>
          n.nutrientName?.toLowerCase().includes(name),
        );
        return n?.value || 0;
      };

      return {
        id: `usda-${food.fdcId}`,
        name: food.description,
        nameEs: null,
        brand: food.brandOwner || null,
        category: food.foodCategory,
        calories: getNutrient('energy') || getNutrient('calories'),
        protein: getNutrient('protein'),
        carbohydrates: getNutrient('carbohydrate'),
        fat: getNutrient('total lipid'),
        fiber: getNutrient('fiber'),
        servingSize: 100,
        servingUnit: 'g',
        source: FoodSource.USDA,
        externalId: String(food.fdcId),
      };
    });
  }

  // ─── Búsqueda por código de barras ────────────────
  async searchByBarcode(barcode: string) {
    const cacheKey = `barcode:${barcode}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    // 1. BD local
    const local = await this.prisma.foodItem.findFirst({
      where: { barcode },
    });

    if (local) {
      await this.cacheManager.set(cacheKey, local, 3600);
      return local;
    }

    // 2. Open Food Facts
    const offResult = await this.nutritionDb.searchByBarcode(barcode);

    if (offResult) {
      const saved = await this.prisma.foodItem.upsert({
        where: { id: `off-${barcode}` },
        update: { usageCount: { increment: 1 } },
        create: {
          id: `off-${barcode}`,
          name: offResult.name,
          brand: offResult.brand,
          barcode,
          calories: offResult.calories,
          protein: offResult.protein,
          carbohydrates: offResult.carbohydrates,
          fat: offResult.fat,
          fiber: offResult.fiber || 0,
          sugar: offResult.sugar || 0,
          sodium: offResult.sodium || 0,
          imageUrl: offResult.imageUrl,
          source: FoodSource.OPEN_FOOD_FACTS,
          externalId: `off-${barcode}`,
          confidenceScore: 0.85,
        },
      });

      await this.cacheManager.set(cacheKey, saved, 3600);
      return saved;
    }

    throw new NotFoundException(`No se encontró el alimento con código ${barcode}`);
  }

  // ─── Obtener alimento por ID ──────────────────────
  async getFoodById(id: string) {
    const cacheKey = `food:${id}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const food = await this.prisma.foodItem.findUnique({ where: { id } });

    if (!food) throw new NotFoundException('Alimento no encontrado');

    await this.cacheManager.set(cacheKey, food, 1800);
    return food;
  }

  // ─── Calcular nutrición de porción ────────────────
  calculatePortion(
    food: { calories: number; protein: number; carbohydrates: number; fat: number; fiber?: number | null },
    portionGrams: number,
  ) {
    const ratio = portionGrams / 100;
    return {
      portionGrams,
      calories: Math.round(food.calories * ratio * 10) / 10,
      protein: Math.round(food.protein * ratio * 10) / 10,
      carbohydrates: Math.round(food.carbohydrates * ratio * 10) / 10,
      fat: Math.round(food.fat * ratio * 10) / 10,
      fiber: Math.round((food.fiber || 0) * ratio * 10) / 10,
    };
  }

  // ─── Alimentos frecuentes del usuario ────────────
  async getFrequentFoods(userId: string, limit = 10) {
    const frequentFoodIds = await this.prisma.diaryEntryFood.groupBy({
      by: ['foodItemId'],
      where: { diaryEntry: { userId } },
      _count: { foodItemId: true },
      orderBy: { _count: { foodItemId: 'desc' } },
      take: limit,
    });

    if (frequentFoodIds.length === 0) return [];

    const foods = await this.prisma.foodItem.findMany({
      where: { id: { in: frequentFoodIds.map((f) => f.foodItemId) } },
    });

    return foods;
  }

  // ─── Alimentos recientes del usuario ──────────────
  async getRecentFoods(userId: string, limit = 10) {
    const recent = await this.prisma.diaryEntryFood.findMany({
      where: { diaryEntry: { userId } },
      include: { foodItem: true },
      orderBy: { diaryEntry: { createdAt: 'desc' } },
      take: limit * 3, // Tomar más para deduplicar
      distinct: ['foodItemId'],
    });

    return recent.slice(0, limit).map((r) => r.foodItem);
  }
}
