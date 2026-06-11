'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { useCallback } from 'react';

const ROLE_OPTIONS = [
  { value: '', label: 'Todos los roles' },
  { value: 'USER', label: 'Usuario' },
  { value: 'PREMIUM', label: 'Premium' },
  { value: 'ADMIN', label: 'Admin' },
];

const SUB_OPTIONS = [
  { value: '', label: 'Todas las suscripciones' },
  { value: 'FREE', label: 'Free' },
  { value: 'TRIAL', label: 'Trial' },
  { value: 'ACTIVE', label: 'Activo' },
  { value: 'EXPIRED', label: 'Expirado' },
];

export function UsersFilters() {
  const router = useRouter();
  const params = useSearchParams();

  const update = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(params.toString());
      if (value) p.set(key, value);
      else p.delete(key);
      p.delete('page');
      router.push(`?${p.toString()}`);
    },
    [router, params],
  );

  return (
    <div className="flex flex-wrap gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-52">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          defaultValue={params.get('q') ?? ''}
          placeholder="Buscar por nombre o email..."
          onChange={(e) => update('q', e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Role filter */}
      <select
        defaultValue={params.get('role') ?? ''}
        onChange={(e) => update('role', e.target.value)}
        className="px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Subscription filter */}
      <select
        defaultValue={params.get('subscription') ?? ''}
        onChange={(e) => update('subscription', e.target.value)}
        className="px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {SUB_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
