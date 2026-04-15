'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

function getStoredTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return (localStorage.getItem('bt-admin-theme') as 'dark' | 'light') ?? 'dark';
}

function applyTheme(theme: 'dark' | 'light') {
  const html = document.documentElement;
  if (theme === 'light') {
    html.classList.remove('dark');
    html.classList.add('light');
  } else {
    html.classList.remove('light');
    html.classList.add('dark');
  }
  localStorage.setItem('bt-admin-theme', theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = getStoredTheme();
    applyTheme(stored);
    setTheme(stored);
    setMounted(true);
  }, []);

  if (!mounted) return null;

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-dash-border text-slate-600 dark:text-v-secondary bg-white dark:bg-dash-card hover:bg-slate-50 dark:hover:bg-dash-surface transition-colors"
      title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
    >
      {theme === 'dark' ? (
        <><Sun className="w-3.5 h-3.5" /> Claro</>
      ) : (
        <><Moon className="w-3.5 h-3.5" /> Escuro</>
      )}
    </button>
  );
}
