'use client'

import { useState, useRef, useEffect } from 'react'

interface Version {
  label: string
  value: string
  status: 'beta' | 'stable' | 'dev'
}

const versions: Version[] = [
  { label: '0.2', value: '0.2', status: 'beta' },
  { label: '0.1', value: '0.1', status: 'stable' },
]

const statusColors: Record<string, string> = {
  beta: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  stable: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  dev: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
}

export function VersionSwitcher() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(versions[0])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        <span>v{current.label}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusColors[current.status]}`}>
          {current.status}
        </span>
        <svg className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-background shadow-lg">
          {versions.map((v) => (
            <button
              key={v.value}
              onClick={() => {
                setCurrent(v)
                setOpen(false)
              }}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-muted ${
                v.value === current.value ? 'bg-muted font-medium' : ''
              }`}
            >
              {v.value === current.value && (
                <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {v.value !== current.value && <span className="w-4" />}
              <span>Version {v.label}</span>
              <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusColors[v.status]}`}>
                {v.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
