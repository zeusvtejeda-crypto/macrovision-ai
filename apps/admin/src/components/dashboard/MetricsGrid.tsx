import { Users, Camera, CreditCard, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn, formatNumber, pct } from '@/lib/utils';

interface Metric {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

interface Props {
  metrics: any;
}

export function MetricsGrid({ metrics }: Props) {
  const data: Metric[] = [
    {
      label: 'Usuarios totales',
      value: formatNumber(metrics?.totalUsers ?? 0),
      delta: metrics?.newUsersToday ?? 0,
      deltaLabel: `+${metrics?.newUsersToday ?? 0} hoy`,
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: 'Análisis hoy',
      value: formatNumber(metrics?.analysesToday ?? 0),
      delta: metrics?.aiErrorRate ?? 0,
      deltaLabel: `${((metrics?.aiErrorRate ?? 0) * 100).toFixed(1)}% error`,
      icon: Camera,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: 'Suscriptores activos',
      value: formatNumber(metrics?.premiumUsers ?? 0),
      delta: metrics?.conversionRate ?? 0,
      deltaLabel: `${((metrics?.conversionRate ?? 0) * 100).toFixed(1)}% conversión`,
      icon: CreditCard,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
    },
    {
      label: 'Usuarios activos hoy',
      value: formatNumber(metrics?.activeToday ?? 0),
      delta: metrics?.activeThisWeek ?? 0,
      deltaLabel: `${formatNumber(metrics?.activeThisWeek ?? 0)} esta semana`,
      icon: TrendingUp,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {data.map((metric) => (
        <div key={metric.label} className="rounded-xl border bg-card p-5">
          <div className="flex items-start justify-between mb-4">
            <div className={cn('p-2 rounded-lg', metric.bgColor)}>
              <metric.icon className={cn('w-4 h-4', metric.color)} />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground mb-1">{metric.value}</div>
          <div className="text-sm text-muted-foreground mb-2">{metric.label}</div>
          {metric.deltaLabel && (
            <div className="text-xs text-muted-foreground/70">{metric.deltaLabel}</div>
          )}
        </div>
      ))}
    </div>
  );
}
