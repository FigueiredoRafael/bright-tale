'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SearchEntry } from '@/src/lib/search-index'

export function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <span className="hidden sm:inline">Buscar...</span>
      <kbd className="hidden rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
        ⌘K
      </kbd>
    </button>
  )
}

export function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchEntry[]>([])
  const [index, setIndex] = useState<SearchEntry[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (open) {
      fetch('/api/search')
        .then((r) => r.json())
        .then(setIndex)
      setQuery('')
      setResults([])
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([])
      setSelected(0)
      return
    }
    const q = query.toLowerCase()
    const filtered = index.filter(
      (entry) =>
        entry.title.toLowerCase().includes(q) ||
        entry.excerpt.toLowerCase().includes(q) ||
        entry.section.toLowerCase().includes(q)
    )
    setResults(filtered.slice(0, 20))
    setSelected(0)
  }, [query, index])

  const navigate = useCallback(
    (href: string) => {
      onClose()
      router.push(href)
    },
    [onClose, router]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelected((s) => (s + 1) % Math.max(results.length, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected((s) => (s - 1 + results.length) % Math.max(results.length, 1))
      } else if (e.key === 'Enter' && results[selected]) {
        e.preventDefault()
        navigate(results[selected].href)
      }
    },
    [results, selected, navigate]
  )

  // Group results by section
  const grouped = results.reduce<Record<string, SearchEntry[]>>((acc, entry) => {
    if (!acc[entry.section]) acc[entry.section] = []
    acc[entry.section].push(entry)
    return acc
  }, {})

  let flatIndex = 0

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 top-[15%] z-50 mx-auto w-full max-w-xl px-4">
        <div className="search-modal-enter overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
          {/* Search input */}
          <div className="flex items-center border-b border-border px-4">
            <svg className="h-5 w-5 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Buscar na documentacao..."
              className="h-14 w-full bg-transparent px-3 text-base text-foreground outline-none placeholder:text-muted-foreground"
            />
            <kbd
              onClick={onClose}
              className="cursor-pointer rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {query.length >= 2 && results.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhum resultado encontrado.
              </p>
            )}

            {Object.entries(grouped).map(([section, entries]) => (
              <div key={section} className="mb-2">
                <h3 className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section}
                </h3>
                {entries.map((entry) => {
                  const currentIndex = flatIndex++
                  return (
                    <button
                      key={entry.href}
                      onClick={() => navigate(entry.href)}
                      className={`flex w-full flex-col rounded-lg px-3 py-2.5 text-left transition-colors ${
                        currentIndex === selected
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <span className="text-sm font-medium">{entry.title}</span>
                      <span
                        className={`mt-0.5 line-clamp-1 text-xs ${
                          currentIndex === selected ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        }`}
                      >
                        {entry.excerpt}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}

            {query.length < 2 && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Digite ao menos 2 caracteres para buscar
                </p>
                <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                  <span><kbd className="rounded border border-border px-1.5 py-0.5">↑↓</kbd> navegar</span>
                  <span><kbd className="rounded border border-border px-1.5 py-0.5">↵</kbd> abrir</span>
                  <span><kbd className="rounded border border-border px-1.5 py-0.5">esc</kbd> fechar</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
