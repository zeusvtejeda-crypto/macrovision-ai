'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'COMPLETED', label: 'Completado' },
  { value: 'FAILED', label: 'Fallido' },
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'PARTIALLY_COMPLETED', label: 'Parcial' },
];

export function AnalysesFilters() {
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
      <select
        defaultValue={params.get('status') ?? ''}
        onChange={(e) => update('status', e.target.value)}
        className="px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <input
        type="date"
        defaultValue={params.get('date') ?? ''}
        onChange={(e) => update('date', e.target.value)}
        className="px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}
