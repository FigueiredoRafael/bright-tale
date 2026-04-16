'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { adminPath } from '@/lib/admin-path';

export function UsersFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchValue, setSearchValue] = useState(searchParams.get('search') ?? '');

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== 'all') {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set('page', '1');
      router.push(`${adminPath('/users')}?${params.toString()}`);
    },
    [router, searchParams],
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParam('search', val);
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const premium = searchParams.get('premium') ?? 'all';
  const active = searchParams.get('active') ?? 'all';
  const role = searchParams.get('role') ?? 'all';

  const selectClass =
    'h-9 px-3 text-sm bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-lg text-slate-700 dark:text-v-primary focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-v-blue/50 transition-colors';

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Search */}
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-v-dim pointer-events-none" />
        <input
          type="text"
          value={searchValue}
          onChange={handleSearchChange}
          placeholder="Buscar por nome ou e-mail…"
          className="w-full h-9 pl-9 pr-3 text-sm bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-lg text-slate-700 dark:text-v-primary placeholder:text-slate-400 dark:placeholder:text-v-dim focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-v-blue/50 transition-colors"
        />
      </div>

      {/* Premium filter */}
      <select
        value={premium}
        onChange={(e) => updateParam('premium', e.target.value)}
        className={selectClass}
      >
        <option value="all">Plano: Todos</option>
        <option value="true">Premium</option>
        <option value="false">Gratuito</option>
      </select>

      {/* Active filter */}
      <select
        value={active}
        onChange={(e) => updateParam('active', e.target.value)}
        className={selectClass}
      >
        <option value="all">Status: Todos</option>
        <option value="true">Ativo</option>
        <option value="false">Inativo</option>
      </select>

      {/* Role filter */}
      <select
        value={role}
        onChange={(e) => updateParam('role', e.target.value)}
        className={selectClass}
      >
        <option value="all">Papel: Todos</option>
        <option value="admin">Admin</option>
      </select>
    </div>
  );
}
