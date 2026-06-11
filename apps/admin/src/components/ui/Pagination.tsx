'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  currentPage: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

export function Pagination({ currentPage, totalPages, total, pageSize }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const goTo = (page: number) => {
    const p = new URLSearchParams(params.toString());
    p.set('page', String(page));
    router.push(`?${p.toString()}`);
  };

  const from = Math.min((currentPage - 1) * pageSize + 1, total);
  const to = Math.min(currentPage * pageSize, total);

  if (totalPages <= 1) return null;

  const pages = getPagesToShow(currentPage, totalPages);

  return (
    <div className="flex items-center justify-between text-sm">
      <p className="text-muted-foreground">
        Mostrando <span className="font-medium text-foreground">{from}–{to}</span> de{' '}
        <span className="font-medium text-foreground">{total}</span>
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => goTo(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground">…</span>
          ) : (
            <button
              key={p}
              onClick={() => goTo(p as number)}
              className={cn(
                'w-8 h-8 rounded-md text-sm font-medium transition-colors',
                p === currentPage
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-foreground',
              )}
            >
              {p}
            </button>
          ),
        )}

        <button
          onClick={() => goTo(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function getPagesToShow(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}
