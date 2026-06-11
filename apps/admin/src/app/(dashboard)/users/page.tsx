import { Suspense } from 'react';
import { UsersTable } from '@/components/users/UsersTable';
import { UsersFilters } from '@/components/users/UsersFilters';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: { page?: string; q?: string; role?: string; subscription?: string };
}

export default function UsersPage({ searchParams }: Props) {
  const page = Number(searchParams.page ?? 1);
  const query = searchParams.q ?? '';
  const role = searchParams.role ?? '';
  const subscription = searchParams.subscription ?? '';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestiona todos los usuarios registrados
          </p>
        </div>
      </div>

      <UsersFilters />

      <Suspense
        key={`${page}-${query}-${role}-${subscription}`}
        fallback={<TableSkeleton />}
      >
        <UsersTable page={page} query={query} role={role} subscription={subscription} />
      </Suspense>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="p-4 border-b bg-muted/30 h-12 animate-pulse" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="p-4 border-b h-14 animate-pulse" style={{ opacity: 1 - i * 0.1 }} />
      ))}
    </div>
  );
}
