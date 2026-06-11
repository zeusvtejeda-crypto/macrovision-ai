import { Suspense } from 'react';
import { SubscriptionsTable } from '@/components/subscriptions/SubscriptionsTable';
import { SubscriptionStats } from '@/components/subscriptions/SubscriptionStats';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: { page?: string; plan?: string; status?: string };
}

export default function SubscriptionsPage({ searchParams }: Props) {
  const page = Number(searchParams.page ?? 1);
  const plan = searchParams.plan ?? '';
  const status = searchParams.status ?? '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Suscripciones</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gestiona planes, pagos y conversiones
        </p>
      </div>

      <Suspense fallback={<div className="grid grid-cols-4 gap-4"><div className="h-24 rounded-xl bg-muted animate-pulse col-span-4" /></div>}>
        <SubscriptionStats />
      </Suspense>

      <Suspense key={`${page}-${plan}-${status}`} fallback={<div className="h-96 rounded-xl bg-muted animate-pulse" />}>
        <SubscriptionsTable page={page} plan={plan} status={status} />
      </Suspense>
    </div>
  );
}
