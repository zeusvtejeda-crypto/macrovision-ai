import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { AnalysisStatus, SubscriptionStatus } from '@enums';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Métricas generales ───────────────────────────
  async getMetrics() {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    const thisMonth = new Date(today);
    thisMonth.setDate(1);

    const [
      totalUsers,
      newUsersToday,
      newUsersWeek,
      activeUsersToday,
      premiumUsers,
      trialUsers,
      totalAnalyses,
      analysesToday,
      failedAnalyses,
      avgConfidence,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: today } } }),
      this.prisma.user.count({ where: { createdAt: { gte: thisWeek } } }),
      this.prisma.user.count({ where: { lastActiveAt: { gte: today } } }),
      this.prisma.user.count({
        where: { subscriptionStatus: SubscriptionStatus.ACTIVE },
      }),
      this.prisma.user.count({
        where: { subscriptionStatus: SubscriptionStatus.TRIAL },
      }),
      this.prisma.foodAnalysis.count(),
      this.prisma.foodAnalysis.count({ where: { createdAt: { gte: today } } }),
      this.prisma.foodAnalysis.count({
        where: { status: AnalysisStatus.FAILED },
      }),
      this.prisma.foodAnalysis.aggregate({
        where: {
          status: AnalysisStatus.COMPLETED,
          confidenceScore: { not: null },
        },
        _avg: { confidenceScore: true },
      }),
    ]);

    const conversionRate =
      totalUsers > 0
        ? Math.round(((premiumUsers + trialUsers) / totalUsers) * 100 * 10) / 10
        : 0;

    const aiErrorRate =
      totalAnalyses > 0
        ? Math.round((failedAnalyses / totalAnalyses) * 100 * 10) / 10
        : 0;

    return {
      users: {
        total: totalUsers,
        newToday: newUsersToday,
        newThisWeek: newUsersWeek,
        activeToday: activeUsersToday,
        premium: premiumUsers,
        trial: trialUsers,
        conversionRate,
      },
      analyses: {
        total: totalAnalyses,
        today: analysesToday,
        failed: failedAnalyses,
        errorRate: aiErrorRate,
        avgConfidence: Math.round((avgConfidence._avg.confidenceScore || 0) * 100),
      },
      timestamp: now.toISOString(),
    };
  }

  // ─── Lista de usuarios ────────────────────────────
  async getUsers(page = 1, limit = 50, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          subscriptionStatus: true,
          emailVerified: true,
          onboardingCompleted: true,
          createdAt: true,
          lastLoginAt: true,
          _count: {
            select: { analyses: true, diaryEntries: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Análisis fallidos (para monitoreo IA) ────────
  async getFailedAnalyses(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.foodAnalysis.findMany({
        where: { status: AnalysisStatus.FAILED },
        include: {
          user: { select: { email: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.foodAnalysis.count({ where: { status: AnalysisStatus.FAILED } }),
    ]);

    return { items, total, page, totalPages: Math.ceil(total / limit) };
  }

  // ─── Feedback de IA ───────────────────────────────
  async getAiFeedback(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [items, total, avgRating] = await Promise.all([
      this.prisma.aiFeedback.findMany({
        include: {
          analysis: { select: { mealName: true, confidenceScore: true, imageUrl: true } },
          user: { select: { email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.aiFeedback.count(),
      this.prisma.aiFeedback.aggregate({ _avg: { rating: true } }),
    ]);

    return {
      items,
      total,
      avgRating: Math.round((avgRating._avg.rating || 0) * 10) / 10,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Health check ─────────────────────────────────
  async healthCheck() {
    const dbOk = await this.prisma
      .$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);

    return {
      status: dbOk ? 'ok' : 'degraded',
      version: process.env.APP_VERSION || '1.0.0',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? 'healthy' : 'unhealthy',
      },
    };
  }
}
