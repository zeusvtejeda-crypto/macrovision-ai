import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@database/prisma.service';
import { OnboardingDto } from './dto/onboarding.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { calculateTdee } from './utils/tdee.calculator';
import { UnitSystem, Sex, ActivityLevel, UserGoal } from '@enums';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Onboarding ───────────────────────────────────
  async completeOnboarding(userId: string, dto: OnboardingDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (!user.profile) throw new NotFoundException('Perfil no encontrado');

    // Convertir a métrico si el usuario está en imperial
    let weightKg = dto.weight;
    let heightCm = dto.height;

    if (dto.unitSystem === UnitSystem.IMPERIAL) {
      weightKg = dto.weight * 0.453592; // lbs → kg
      heightCm = dto.height * 2.54;    // pulgadas → cm
    }

    // Calcular TDEE y macros
    const tdeeResult = calculateTdee({
      age: dto.age,
      sex: dto.sex,
      weight: weightKg,
      height: heightCm,
      activityLevel: dto.activityLevel,
      goal: dto.goal,
    });

    // Actualizar perfil
    await this.prisma.userProfile.update({
      where: { userId },
      data: {
        age: dto.age,
        sex: dto.sex,
        weight: weightKg,
        height: heightCm,
        activityLevel: dto.activityLevel,
        goal: dto.goal,
        unitSystem: dto.unitSystem || UnitSystem.METRIC,
        dietaryRestrictions: JSON.stringify(dto.dietaryRestrictions || []),
        allergies: JSON.stringify(dto.allergies || []),
        bmr: tdeeResult.bmr,
        tdee: tdeeResult.tdee,
        targetCalories: tdeeResult.targetCalories,
        targetProtein: tdeeResult.targetProtein,
        targetCarbs: tdeeResult.targetCarbs,
        targetFat: tdeeResult.targetFat,
        targetFiber: tdeeResult.targetFiber,
        proteinPercent: tdeeResult.proteinPercent,
        carbsPercent: tdeeResult.carbsPercent,
        fatPercent: tdeeResult.fatPercent,
      },
    });

    // Marcar onboarding como completado
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingCompleted: true },
      include: { profile: true },
    });

    return { user: updatedUser, tdee: tdeeResult };
  }

  // ─── Obtener perfil ───────────────────────────────
  async getProfile(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) throw new NotFoundException('Perfil no encontrado');
    return profile;
  }

  // ─── Actualizar perfil ────────────────────────────
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) throw new NotFoundException();

    // Actualizar nombre en user si se provee
    if (dto.name) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { name: dto.name },
      });
    }

    // Recalcular TDEE si cambiaron datos físicos
    const physicalChanged =
      dto.age || dto.sex || dto.weight || dto.height ||
      dto.activityLevel || dto.goal;

    const profileData: any = { ...dto };
    delete profileData.name;

    if (physicalChanged && user.profile) {
      const current = user.profile;
      const tdeeResult = calculateTdee({
        age: dto.age ?? current.age ?? 25,
        sex: (dto.sex ?? current.sex ?? 'MALE') as Sex,
        weight: dto.weight ?? current.weight ?? 70,
        height: dto.height ?? current.height ?? 170,
        activityLevel: (dto.activityLevel ?? current.activityLevel ?? 'MODERATELY_ACTIVE') as ActivityLevel,
        goal: (dto.goal ?? current.goal ?? 'MAINTAIN_WEIGHT') as UserGoal,
      });

      // Solo sobrescribir TDEE automáticamente si no hay targets manuales en el dto
      if (!dto.targetCalories) {
        profileData.bmr = tdeeResult.bmr;
        profileData.tdee = tdeeResult.tdee;
        profileData.targetCalories = tdeeResult.targetCalories;
        profileData.targetProtein = tdeeResult.targetProtein;
        profileData.targetCarbs = tdeeResult.targetCarbs;
        profileData.targetFat = tdeeResult.targetFat;
        profileData.targetFiber = tdeeResult.targetFiber;
        profileData.proteinPercent = tdeeResult.proteinPercent;
        profileData.carbsPercent = tdeeResult.carbsPercent;
        profileData.fatPercent = tdeeResult.fatPercent;
      }
    }

    return this.prisma.userProfile.update({
      where: { userId },
      data: profileData,
    });
  }

  // ─── Peso corporal ────────────────────────────────
  async logWeight(userId: string, weight: number, note?: string) {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException();

    const [log] = await Promise.all([
      this.prisma.weightLog.create({
        data: { userId, weight, note },
      }),
      this.prisma.userProfile.update({
        where: { userId },
        data: { weight },
      }),
    ]);

    return log;
  }

  async getWeightHistory(userId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.prisma.weightLog.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });
  }

  // ─── Cambiar contraseña ───────────────────────────
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user?.passwordHash) {
      throw new BadRequestException(
        'Esta cuenta usa autenticación social, sin contraseña',
      );
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) throw new ConflictException('Contraseña actual incorrecta');

    const hash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash },
    });
  }

  // ─── Racha (streak) ───────────────────────────────
  async updateStreak(userId: string): Promise<void> {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    if (!profile) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let newStreak = profile.currentStreak;
    const lastLog = profile.lastLogDate;

    if (!lastLog) {
      newStreak = 1;
    } else {
      const lastLogDay = new Date(lastLog);
      lastLogDay.setHours(0, 0, 0, 0);

      if (lastLogDay.getTime() === today.getTime()) {
        return; // Ya se registró hoy
      } else if (lastLogDay.getTime() === yesterday.getTime()) {
        newStreak += 1;
      } else {
        newStreak = 1; // Racha rota
      }
    }

    await this.prisma.userProfile.update({
      where: { userId },
      data: {
        currentStreak: newStreak,
        longestStreak: Math.max(newStreak, profile.longestStreak),
        lastLogDate: new Date(),
        totalLogsCount: { increment: 1 },
      },
    });
  }

  // ─── Recalcular TDEE ──────────────────────────────
  async recalculateTdee(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });

    if (!profile?.age || !profile?.sex || !profile?.weight ||
        !profile?.height || !profile?.activityLevel || !profile?.goal) {
      throw new BadRequestException(
        'Completa el onboarding antes de recalcular el TDEE',
      );
    }

    const result = calculateTdee({
      age: profile.age,
      sex: profile.sex as Sex,
      weight: profile.weight,
      height: profile.height,
      activityLevel: profile.activityLevel as ActivityLevel,
      goal: profile.goal as UserGoal,
    });

    await this.prisma.userProfile.update({
      where: { userId },
      data: {
        bmr: result.bmr,
        tdee: result.tdee,
        targetCalories: result.targetCalories,
        targetProtein: result.targetProtein,
        targetCarbs: result.targetCarbs,
        targetFat: result.targetFat,
        targetFiber: result.targetFiber,
        proteinPercent: result.proteinPercent,
        carbsPercent: result.carbsPercent,
        fatPercent: result.fatPercent,
      },
    });

    return result;
  }

  // ─── Dashboard / Estadísticas ─────────────────────
  async getDashboard(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [profile, todayEntries] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId } }),
      this.prisma.diaryEntry.findMany({
        where: {
          userId,
          date: { gte: today, lt: tomorrow },
        },
      }),
    ]);

    const consumed = todayEntries.reduce(
      (acc, entry) => ({
        calories: acc.calories + entry.totalCalories,
        protein: acc.protein + entry.totalProtein,
        carbs: acc.carbs + entry.totalCarbs,
        fat: acc.fat + entry.totalFat,
        fiber: acc.fiber + entry.totalFiber,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    );

    const targetCalories = profile?.targetCalories || 2000;

    return {
      date: today.toISOString().split('T')[0],
      consumed,
      goals: {
        calories: targetCalories,
        protein: profile?.targetProtein || 150,
        carbs: profile?.targetCarbs || 200,
        fat: profile?.targetFat || 67,
        fiber: profile?.targetFiber || 25,
      },
      caloriesRemaining: Math.max(0, targetCalories - consumed.calories),
      caloriesBurned: 0, // Placeholder para integración con Apple Health
      percentComplete: Math.min(100, Math.round((consumed.calories / targetCalories) * 100)),
      streak: {
        current: profile?.currentStreak || 0,
        longest: profile?.longestStreak || 0,
      },
    };
  }

  // ─── Resumen semanal ──────────────────────────────
  async getWeeklySummary(userId: string) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const entries = await this.prisma.diaryEntry.findMany({
      where: { userId, date: { gte: weekStart } },
    });

    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });

    const byDay: Record<string, typeof entries> = {};
    for (const entry of entries) {
      const day = entry.date.toISOString().split('T')[0];
      byDay[day] = byDay[day] || [];
      byDay[day].push(entry);
    }

    const days = Object.entries(byDay).map(([date, dayEntries]) => {
      const totals = dayEntries.reduce(
        (acc, e) => ({
          calories: acc.calories + e.totalCalories,
          protein: acc.protein + e.totalProtein,
          carbs: acc.carbs + e.totalCarbs,
          fat: acc.fat + e.totalFat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      );
      return { date, ...totals };
    });

    const daysLogged = days.length;
    const avgCalories = daysLogged
      ? Math.round(days.reduce((s, d) => s + d.calories, 0) / daysLogged)
      : 0;

    const targetCalories = profile?.targetCalories || 2000;
    const calorieGoalMet = days.filter(
      (d) => Math.abs(d.calories - targetCalories) < targetCalories * 0.1,
    ).length;

    return {
      weekStart: weekStart.toISOString().split('T')[0],
      daysLogged,
      calorieGoalMet,
      averageCalories: avgCalories,
      days,
    };
  }
}
