import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { adminApi } from '@/lib/api';
import { formatNumber, formatCurrency } from '@/lib/utils';
import { CreditCard, TrendingUp, Users, DollarSign } from 'lucide-react';

export async function SubscriptionStats() {
  const session = await getServerSession(authOptions);
  const metrics = await adminApi.getMetrics(session?.accessToken as string).catch(() => null);

  const stats = [
    {
      label: 'Suscriptores activos',
      value: formatNumber(metrics?.premiumUsers ?? 0),
      icon: Users,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'En trial',
      value: formatNumber(metrics?.trialUsers ?? 0),
      icon: CreditCard,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Tasa de conversión',
      value: `${((metrics?.conversionRate ?? 0) * 100).toFixed(1)}%`,
      icon: TrendingUp,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      label: 'MRR estimado',
      value: formatCurrency((metrics?.premiumUsers ?? 0) * 499 + (metrics?.annualUsers ?? 0) * 299),
      icon: DollarSign,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border bg-card p-4">
          <div className={`inline-flex p-2 rounded-lg ${s.bg} mb-3`}>
            <s.icon className={`w-4 h-4 ${s.color}`} />
          </div>
          <div className="text-xl font-bold">{s.value}</div>
          <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
