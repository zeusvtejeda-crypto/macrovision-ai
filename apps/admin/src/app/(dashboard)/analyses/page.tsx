import { Suspense } from 'react';
import { AnalysesTable } from '@/components/analyses/AnalysesTable';
import { AnalysesFilters } from '@/components/analyses/AnalysesFilters';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: { page?: string; status?: string; date?: string };
}

export default function AnalysesPage({ searchParams }: Props) {
  const page = Number(searchParams.page ?? 1);
  const status = searchParams.status ?? '';
  const date = searchParams.date ?? '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Análisis de IA</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Monitorea todos los análisis de imágenes realizados
        </p>
      </div>

      <AnalysesFilters />

      <Suspense
        key={`${page}-${status}-${date}`}
        fallback={<TableSkeleton />}
      >
        <AnalysesTable page={page} status={status} date={date} />
      </Suspense>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="p-4 border-b bg-muted/30 h-12 animate-pulse" />
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="p-4 border-b h-14 animate-pulse" style={{ opacity: 1 - i * 0.09 }} />
      ))}
    </div>
  );
}
