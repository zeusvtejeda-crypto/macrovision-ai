import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { adminApi } from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';
import { CheckCircle2, AlertCircle, Clock, XCircle, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  COMPLETED:            { label: 'Completado',  icon: CheckCircle2, color: 'text-primary',     bg: 'bg-primary/10' },
  FAILED:               { label: 'Fallido',     icon: XCircle,      color: 'text-destructive', bg: 'bg-destructive/10' },
  PENDING:              { label: 'Pendiente',   icon: Clock,        color: 'text-muted-foreground', bg: 'bg-muted' },
  PROCESSING:           { label: 'Procesando',  icon: Clock,        color: 'text-blue-500',    bg: 'bg-blue-500/10' },
  PARTIALLY_COMPLETED:  { label: 'Parcial',     icon: AlertCircle,  color: 'text-amber-500',   bg: 'bg-amber-500/10' },
};

interface Props { page: number; status: string; date: string; }

export async function AnalysesTable({ page, status, date }: Props) {
  const session = await getServerSession(authOptions);

  const data = await adminApi
    .getAnalyses(session?.accessToken as string, {
      page,
      limit: 20,
      ...(status && { status }),
      ...(date && { date }),
    })
    .catch(() => ({ items: [], total: 0, totalPages: 1 }));

  const analyses = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Análisis</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Usuario</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Confianza</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Calorías</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {analyses.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  Sin análisis
                </td>
              </tr>
            ) : (
              analyses.map((a: any) => {
                const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.PENDING;
                const Icon = cfg.icon;
                const confidence = a.confidenceScore ? Math.round(a.confidenceScore * 100) : null;

                return (
                  <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                    {/* Analysis */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
                          {a.imageThumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.imageThumbnailUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-muted/50 flex items-center justify-center text-lg">🍽</div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{a.mealName ?? a.mealType ?? 'Sin nombre'}</p>
                          <p className="text-xs text-muted-foreground">{a.id.slice(0, 8)}…</p>
                        </div>
                      </div>
                    </td>

                    {/* User */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-sm truncate max-w-[160px]">{a.user?.email ?? '—'}</p>
                    </td>

                    {/* Confidence */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {confidence !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${confidence}%`,
                                backgroundColor: confidence >= 85 ? '#10b981' : confidence >= 65 ? '#f59e0b' : '#ef4444',
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{confidence}%</span>
                        </div>
                      ) : (
                        <Minus className="w-3 h-3 text-muted-foreground" />
                      )}
                    </td>

                    {/* Calories */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="font-medium">
                        {a.totalCalories ? `${Math.round(a.totalCalories)} kcal` : '—'}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium', cfg.bg, cfg.color)}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-muted-foreground">{formatRelative(a.createdAt)}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination currentPage={page} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} pageSize={20} />
    </div>
  );
}
