import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { MealType } from '@enums';
import {
  CreateDiaryEntryDto,
  AddFoodToEntryDto,
  UpdateDiaryEntryDto,
} from './dto/diary.dto';

@Injectable()
export class DiaryService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Obtener diario de un día ─────────────────────
  async getDailyDiary(userId: string, date: string) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [entries, profile] = await Promise.all([
      this.prisma.diaryEntry.findMany({
        where: {
          userId,
          date: { gte: dayStart, lt: dayEnd },
        },
        include: {
          foods: {
            include: { foodItem: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { mealType: 'asc' },
      }),
      this.prisma.userProfile.findUnique({ where: { userId } }),
    ]);

    // Agrupar por tipo de comida
    const mealOrder: MealType[] = [
      'BREAKFAST',
      'LUNCH',
      'DINNER',
      'SNACK',
      'PRE_WORKOUT',
      'POST_WORKOUT',
    ];

    const entriesByMeal: Record<string, any[]> = {};
    for (const mealType of mealOrder) {
      entriesByMeal[mealType] = entries.filter((e) => e.mealType === mealType);
    }

    // Totales del día
    const totals = entries.reduce(
      (acc, entry) => ({
        calories: acc.calories + entry.totalCalories,
        protein: acc.protein + entry.totalProtein,
        carbs: acc.carbs + entry.totalCarbs,
        fat: acc.fat + entry.totalFat,
        fiber: acc.fiber + entry.totalFiber,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    );

    const goals = {
      calories: profile?.targetCalories || 2000,
      protein: profile?.targetProtein || 150,
      carbs: profile?.targetCarbs || 200,
      fat: profile?.targetFat || 67,
      fiber: profile?.targetFiber || 25,
    };

    return {
      date,
      entries: entriesByMeal,
      totals,
      goals,
      caloriesRemaining: Math.max(0, goals.calories - totals.calories),
      percentComplete: Math.min(
        100,
        Math.round((totals.calories / goals.calories) * 100),
      ),
    };
  }

  // ─── Crear entrada del diario ─────────────────────
  async createEntry(userId: string, dto: CreateDiaryEntryDto) {
    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    // Verificar si ya existe una entrada para ese tipo de comida ese día
    const existing = await this.prisma.diaryEntry.findUnique({
      where: {
        userId_date_mealType: { userId, date, mealType: dto.mealType },
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Ya existe una entrada de ${dto.mealType} para el ${dto.date}`,
      );
    }

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalFiber = 0;

    const foodsToCreate: any[] = [];

    if (dto.foods && dto.foods.length > 0) {
      const foodItems = await this.prisma.foodItem.findMany({
        where: { id: { in: dto.foods.map((f) => f.foodItemId) } },
      });

      for (let i = 0; i < dto.foods.length; i++) {
        const foodDto = dto.foods[i];
        const foodItem = foodItems.find((fi) => fi.id === foodDto.foodItemId);

        if (!foodItem) continue;

        const ratio = foodDto.portionSize / 100;
        const calories = foodItem.calories * ratio;
        const protein = foodItem.protein * ratio;
        const carbs = foodItem.carbohydrates * ratio;
        const fat = foodItem.fat * ratio;
        const fiber = (foodItem.fiber || 0) * ratio;

        totalCalories += calories;
        totalProtein += protein;
        totalCarbs += carbs;
        totalFat += fat;
        totalFiber += fiber;

        foodsToCreate.push({
          foodItemId: foodDto.foodItemId,
          portionSize: foodDto.portionSize,
          portionUnit: 'g',
          portionDisplay: foodDto.portionDisplay,
          calories,
          protein,
          carbohydrates: carbs,
          fat,
          fiber,
          sortOrder: i,
        });
      }
    }

    return this.prisma.diaryEntry.create({
      data: {
        userId,
        date,
        mealType: dto.mealType,
        mealName: dto.mealName,
        notes: dto.notes,
        totalCalories,
        totalProtein,
        totalCarbs,
        totalFat,
        totalFiber,
        foods: { create: foodsToCreate },
      },
      include: {
        foods: { include: { foodItem: true } },
      },
    });
  }

  // ─── Añadir alimento a entrada existente ──────────
  async addFoodToEntry(
    entryId: string,
    userId: string,
    dto: AddFoodToEntryDto,
  ) {
    const entry = await this.prisma.diaryEntry.findFirst({
      where: { id: entryId, userId },
    });

    if (!entry) throw new NotFoundException('Entrada no encontrada');

    const foodItem = await this.prisma.foodItem.findUnique({
      where: { id: dto.foodItemId },
    });

    if (!foodItem) throw new NotFoundException('Alimento no encontrado');

    const ratio = dto.portionSize / 100;
    const calories = foodItem.calories * ratio;
    const protein = foodItem.protein * ratio;
    const carbs = foodItem.carbohydrates * ratio;
    const fat = foodItem.fat * ratio;
    const fiber = (foodItem.fiber || 0) * ratio;

    const count = await this.prisma.diaryEntryFood.count({
      where: { diaryEntryId: entryId },
    });

    await this.prisma.diaryEntryFood.create({
      data: {
        diaryEntryId: entryId,
        foodItemId: dto.foodItemId,
        portionSize: dto.portionSize,
        portionUnit: 'g',
        portionDisplay: dto.portionDisplay,
        calories,
        protein,
        carbohydrates: carbs,
        fat,
        fiber,
        sortOrder: count,
      },
    });

    // Actualizar totales de la entrada
    return this.recalculateEntryTotals(entryId);
  }

  // ─── Eliminar alimento de entrada ─────────────────
  async removeFoodFromEntry(
    entryId: string,
    foodEntryId: string,
    userId: string,
  ) {
    const entry = await this.prisma.diaryEntry.findFirst({
      where: { id: entryId, userId },
    });

    if (!entry) throw new NotFoundException();

    await this.prisma.diaryEntryFood.delete({
      where: { id: foodEntryId },
    });

    return this.recalculateEntryTotals(entryId);
  }

  // ─── Actualizar entrada ───────────────────────────
  async updateEntry(id: string, userId: string, dto: UpdateDiaryEntryDto) {
    const entry = await this.prisma.diaryEntry.findFirst({
      where: { id, userId },
    });

    if (!entry) throw new NotFoundException();

    return this.prisma.diaryEntry.update({
      where: { id },
      data: dto,
      include: { foods: { include: { foodItem: true } } },
    });
  }

  // ─── Eliminar entrada ─────────────────────────────
  async deleteEntry(id: string, userId: string) {
    const entry = await this.prisma.diaryEntry.findFirst({
      where: { id, userId },
    });

    if (!entry) throw new NotFoundException();

    await this.prisma.diaryEntry.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Historial de fechas con registros ────────────
  async getLoggedDates(userId: string, year: number, month: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);

    const entries = await this.prisma.diaryEntry.findMany({
      where: {
        userId,
        date: { gte: start, lte: end },
      },
      select: { date: true, totalCalories: true },
      orderBy: { date: 'asc' },
    });

    // Agrupar por día
    const byDay: Record<string, number> = {};
    for (const entry of entries) {
      const day = entry.date.toISOString().split('T')[0];
      byDay[day] = (byDay[day] || 0) + entry.totalCalories;
    }

    return Object.entries(byDay).map(([date, calories]) => ({
      date,
      calories: Math.round(calories),
    }));
  }

  // ─── Recalcular totales de una entrada ────────────
  private async recalculateEntryTotals(entryId: string) {
    const foods = await this.prisma.diaryEntryFood.findMany({
      where: { diaryEntryId: entryId },
    });

    const totals = foods.reduce(
      (acc, food) => ({
        calories: acc.calories + food.calories,
        protein: acc.protein + food.protein,
        carbs: acc.carbs + food.carbohydrates,
        fat: acc.fat + food.fat,
        fiber: acc.fiber + (food.fiber || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    );

    return this.prisma.diaryEntry.update({
      where: { id: entryId },
      data: {
        totalCalories: Math.round(totals.calories * 10) / 10,
        totalProtein: Math.round(totals.protein * 10) / 10,
        totalCarbs: Math.round(totals.carbs * 10) / 10,
        totalFat: Math.round(totals.fat * 10) / 10,
        totalFiber: Math.round(totals.fiber * 10) / 10,
      },
      include: { foods: { include: { foodItem: true } } },
    });
  }
}
