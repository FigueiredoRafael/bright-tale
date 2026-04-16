'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useDarkModeGuard } from '@tn-figueiredo/admin/client'

const STORAGE_KEY = 'bt-admin-theme'

export function ThemeToggle() {
  const { mounted, isDark: initialDark } = useDarkModeGuard()
  const [isDark, setIsDark] = useState(initialDark)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as 'dark' | 'light' | null
    if (stored) {
      const dark = stored === 'dark'
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.classList.toggle('light', !dark)
      setIsDark(dark)
    }
  }, [])

  if (!mounted) return null

  function toggle() {
    const next: 'dark' | 'light' = isDark ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', next === 'dark')
    document.documentElement.classList.toggle('light', next === 'light')
    localStorage.setItem(STORAGE_KEY, next)
    setIsDark(next === 'dark')
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Modo claro' : 'Modo escuro'}
      className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
      title={isDark ? 'Modo claro' : 'Modo escuro'}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
