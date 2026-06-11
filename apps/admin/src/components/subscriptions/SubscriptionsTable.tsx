import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { adminApi } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ACTIVE:   { label: 'Activo',    color: 'bg-primary/10 text-primary' },
  TRIAL:    { label: 'Trial',     color: 'bg-blue-500/10 text-blue-500' },
  CANCELED: { label: 'Cancelado', color: 'bg-orange-500/10 text-orange-500' },
  EXPIRED:  { label: 'Expirado',  color: 'bg-destructive/10 text-destructive' },
  PAST_DUE: { label: 'Vencido',   color: 'bg-amber-500/10 text-amber-500' },
  FREE:     { label: 'Free',      color: 'bg-muted text-muted-foreground' },
};

const PLAN_LABELS: Record<string, string> = {
  MONTHLY: 'Mensual',
  ANNUAL: 'Anual',
  LIFETIME: 'Lifetime',
};

interface Props { page: number; plan: string; status: string; }

export async function SubscriptionsTable({ page, plan, status }: Props) {
  const session = await getServerSession(authOptions);

  const data = await adminApi
    .getSubscriptions(session?.accessToken as string, {
      page, limit: 20,
      ...(plan && { plan }),
      ...(status && { status }),
    })
    .catch(() => ({ items: [], total: 0, totalPages: 1 }));

  const subs = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Usuario</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Plan</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Importe</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Renovación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {subs.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-muted-foreground">
                  Sin suscripciones
                </td>
              </tr>
            ) : (
              subs.map((sub: any) => {
                const cfg = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.FREE;
                return (
                  <tr key={sub.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                          {sub.user?.name?.charAt(0).toUpperCase() ?? '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{sub.user?.name ?? '—'}</p>
                          <p className="text-xs text-muted-foreground truncate">{sub.user?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="font-medium">{PLAN_LABELS[sub.plan] ?? sub.plan ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center px-2 py-1 rounded-full text-xs font-medium', cfg.color)}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="font-medium">
                        {sub.amount ? formatCurrency(sub.amount, sub.currency) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                      {sub.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : '—'}
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
