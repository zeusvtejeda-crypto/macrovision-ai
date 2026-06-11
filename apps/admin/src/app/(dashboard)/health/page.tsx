import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { adminApi } from '@/lib/api';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Database,
  Zap,
  Server,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getHealth() {
  const session = await getServerSession(authOptions);
  return adminApi.healthCheck(session?.accessToken as string).catch(() => null);
}

function StatusBadge({ status }: { status: 'ok' | 'warn' | 'error' | boolean }) {
  const isOk = status === 'ok' || status === true;
  const isWarn = status === 'warn';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
        isOk ? 'bg-primary/10 text-primary' : isWarn ? 'bg-amber-500/10 text-amber-500' : 'bg-destructive/10 text-destructive',
      )}
    >
      {isOk ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : isWarn ? (
        <AlertTriangle className="w-3 h-3" />
      ) : (
        <XCircle className="w-3 h-3" />
      )}
      {isOk ? 'Operativo' : isWarn ? 'Degradado' : 'Error'}
    </span>
  );
}

export default async function HealthPage() {
  const health = await getHealth();

  const services = [
    {
      name: 'Base de datos',
      description: 'PostgreSQL 16',
      icon: Database,
      status: health?.database ?? false,
      detail: health?.dbResponseMs ? `${health.dbResponseMs}ms latencia` : undefined,
    },
    {
      name: 'Redis / Cache',
      description: 'Redis 7',
      icon: Server,
      status: health?.redis ?? false,
      detail: health?.redisResponseMs ? `${health.redisResponseMs}ms latencia` : undefined,
    },
    {
      name: 'OpenAI API',
      description: 'GPT-4o Vision',
      icon: Zap,
      status: health?.openai ?? false,
      detail: 'Pipeline primario',
    },
    {
      name: 'Gemini API',
      description: 'Gemini 1.5-flash',
      icon: Zap,
      status: health?.gemini ?? false,
      detail: 'Pipeline fallback',
    },
    {
      name: 'AWS S3',
      description: 'Almacenamiento de imágenes',
      icon: Server,
      status: health?.s3 ?? false,
      detail: undefined,
    },
    {
      name: 'Stripe',
      description: 'Pasarela de pagos',
      icon: Activity,
      status: health?.stripe ?? false,
      detail: undefined,
    },
  ];

  const allOk = services.every((s) => s.status);
  const anyError = services.some((s) => !s.status);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Estado del sistema</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Monitoreo en tiempo real de todos los servicios
        </p>
      </div>

      {/* Overall status */}
      <div className={cn(
        'rounded-xl border p-5 flex items-center gap-4',
        allOk ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5',
      )}>
        {allOk ? (
          <CheckCircle2 className="w-8 h-8 text-primary flex-shrink-0" />
        ) : (
          <XCircle className="w-8 h-8 text-destructive flex-shrink-0" />
        )}
        <div>
          <p className="font-semibold text-base">
            {allOk ? 'Todos los sistemas operativos' : 'Algunos servicios presentan problemas'}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Última verificación: ahora
          </p>
        </div>
      </div>

      {/* Services grid */}
      <div className="grid gap-3">
        {services.map((service) => (
          <div key={service.name} className="rounded-xl border bg-card px-5 py-4 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-muted/50 flex-shrink-0">
              <service.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{service.name}</p>
              <p className="text-xs text-muted-foreground">{service.description}</p>
              {service.detail && (
                <p className="text-xs text-muted-foreground/60 mt-0.5">{service.detail}</p>
              )}
            </div>
            <StatusBadge status={service.status ? 'ok' : 'error'} />
          </div>
        ))}
      </div>
    </div>
  );
}
