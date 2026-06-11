import { Suspense } from 'react';
import { MetricsGrid } from '@/components/dashboard/MetricsGrid';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import { UserGrowthChart } from '@/components/dashboard/UserGrowthChart';
import { RecentAnalyses } from '@/components/dashboard/RecentAnalyses';
import { SystemHealth } from '@/components/dashboard/SystemHealth';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { adminApi } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getMetrics() {
  try {
    const session = await getServerSession(authOptions);
    return await adminApi.getMetrics(session?.accessToken as string);
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const metrics = await getMetrics();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Resumen general de MacroVision AI
        </p>
      </div>

      <Suspense fallback={<MetricsSkeleton />}>
        <MetricsGrid metrics={metrics} />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<ChartSkeleton />}>
          <UserGrowthChart />
        </Suspense>
        <Suspense fallback={<ChartSkeleton />}>
          <RevenueChart />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Suspense fallback={<TableSkeleton />}>
            <RecentAnalyses />
          </Suspense>
        </div>
        <Suspense fallback={<ChartSkeleton />}>
          <SystemHealth metrics={metrics} />
        </Suspense>
      </div>
    </div>
  );
}

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-64 rounded-xl bg-muted animate-pulse" />;
}

function TableSkeleton() {
  return <div className="h-80 rounded-xl bg-muted animate-pulse" />;
}
