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

  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggle}
      className="w-full flex items-center gap-3 px-2 py-2 text-xs rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
      title={isDark ? 'Modo claro' : 'Modo escuro'}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
      <span className="flex-1 text-left text-sm">{isDark ? 'Modo Claro' : 'Modo Escuro'}</span>
    </button>
  );
}
