'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { adminPath } from '@/lib/admin-path';

interface UsersPaginationProps {
  page: number;
  totalPages: number;
}

export function UsersPagination({ page, totalPages }: UsersPaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  const goToPage = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.push(`${adminPath('/users')}?${params.toString()}`);
  };

  // Build page numbers with ellipsis
  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  const btnBase =
    'h-8 px-3 text-sm rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const btnNormal =
    `${btnBase} bg-white dark:bg-dash-card border-slate-200 dark:border-dash-border text-slate-600 dark:text-v-secondary hover:bg-slate-50 dark:hover:bg-dash-surface`;
  const btnActive =
    `${btnBase} bg-blue-600 dark:bg-v-blue border-blue-600 dark:border-v-blue text-white font-semibold`;

  return (
    <div className="flex items-center justify-between pt-3">
      <p className="text-xs text-slate-500 dark:text-v-dim">
        Página {page} de {totalPages}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1}
          className={`${btnNormal} flex items-center gap-1`}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Anterior
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-slate-400 dark:text-v-dim text-sm">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => goToPage(p as number)}
              className={p === page ? btnActive : btnNormal}
            >
              {p}
            </button>
          ),
        )}

        <button
          onClick={() => goToPage(page + 1)}
          disabled={page >= totalPages}
          className={`${btnNormal} flex items-center gap-1`}
        >
          Próxima
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
