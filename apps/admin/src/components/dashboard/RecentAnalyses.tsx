import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { adminApi } from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { CheckCircle2, AlertCircle, Clock, XCircle } from 'lucide-react';
import Link from 'next/link';

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  COMPLETED: { label: 'Completado', icon: CheckCircle2, color: 'text-primary' },
  FAILED: { label: 'Fallido', icon: XCircle, color: 'text-destructive' },
  PENDING: { label: 'Pendiente', icon: Clock, color: 'text-muted-foreground' },
  PARTIALLY_COMPLETED: { label: 'Parcial', icon: AlertCircle, color: 'text-amber-500' },
};

export async function RecentAnalyses() {
  const session = await getServerSession(authOptions);
  const data = await adminApi.getAnalyses(session?.accessToken as string, {
    page: 1,
    limit: 8,
  }).catch(() => ({ items: [] }));

  const analyses = data?.items ?? [];

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between p-5 border-b">
        <h3 className="font-semibold text-sm">Análisis recientes</h3>
        <Link href="/analyses" className="text-xs text-primary hover:underline">
          Ver todos →
        </Link>
      </div>

      <div className="divide-y">
        {analyses.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Sin análisis recientes
          </div>
        ) : (
          analyses.map((a: any) => {
            const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.PENDING;
            const Icon = cfg.icon;
            return (
              <div key={a.id} className="flex items-center gap-4 px-5 py-3">
                {/* Thumbnail */}
                <div className="w-10 h-10 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
                  {a.imageThumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.imageThumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-muted" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {a.mealName ?? a.mealType ?? 'Sin nombre'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.user?.email ?? 'Usuario desconocido'} · {formatRelative(a.createdAt)}
                  </p>
                </div>

                {/* Calories */}
                {a.totalCalories && (
                  <span className="text-sm font-semibold text-foreground/80 flex-shrink-0">
                    {Math.round(a.totalCalories)} kcal
                  </span>
                )}

                {/* Status */}
                <div className={`flex items-center gap-1 flex-shrink-0 ${cfg.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-xs">{cfg.label}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
