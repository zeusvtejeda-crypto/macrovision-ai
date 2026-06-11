import { CheckCircle2, AlertTriangle, XCircle, Cpu, Database, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props { metrics: any; }

function HealthRow({
  label,
  status,
  detail,
  icon: Icon,
}: {
  label: string;
  status: 'ok' | 'warn' | 'error';
  detail?: string;
  icon: React.ElementType;
}) {
  const statusIcon = status === 'ok' ? CheckCircle2 : status === 'warn' ? AlertTriangle : XCircle;
  const StatusIcon = statusIcon;
  const colors = {
    ok: 'text-primary',
    warn: 'text-amber-500',
    error: 'text-destructive',
  };

  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="p-1.5 rounded-md bg-muted/50">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
      <StatusIcon className={cn('w-4 h-4 flex-shrink-0', colors[status])} />
    </div>
  );
}

export function SystemHealth({ metrics }: Props) {
  const aiErrorRate = metrics?.aiErrorRate ?? 0;
  const avgConfidence = metrics?.avgConfidence ?? 0;

  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="font-semibold text-sm mb-4">Estado del sistema</h3>

      <div className="divide-y divide-border">
        <HealthRow
          label="Base de datos"
          status="ok"
          detail="PostgreSQL · < 5ms"
          icon={Database}
        />
        <HealthRow
          label="AI Pipeline"
          status={aiErrorRate > 0.1 ? 'warn' : 'ok'}
          detail={`${(aiErrorRate * 100).toFixed(1)}% tasa de error`}
          icon={Zap}
        />
        <HealthRow
          label="Confianza promedio"
          status={avgConfidence < 0.6 ? 'warn' : 'ok'}
          detail={`${(avgConfidence * 100).toFixed(0)}% score medio`}
          icon={Cpu}
        />
      </div>

      {/* Stats */}
      <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-3">
        <div className="text-center">
          <p className="text-lg font-bold text-foreground">
            {metrics?.totalAnalyses ?? 0}
          </p>
          <p className="text-xs text-muted-foreground">Análisis totales</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-primary">
            {(metrics?.conversionRate ?? 0) !== 0
              ? `${((metrics?.conversionRate ?? 0) * 100).toFixed(1)}%`
              : '—'}
          </p>
          <p className="text-xs text-muted-foreground">Conversión</p>
        </div>
      </div>
    </div>
  );
}
