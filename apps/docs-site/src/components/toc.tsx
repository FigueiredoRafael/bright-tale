'use client'

import { useEffect, useState } from 'react'
import type { TocItem } from '@/src/lib/docs'

export function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: '0% 0% -80% 0%', threshold: 0.1 }
    )

    for (const item of items) {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [items])

  if (items.length === 0) return null

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-52 shrink-0 overflow-y-auto py-5 pl-4 xl:block">
      <h4 className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        Nesta pagina
      </h4>
      <ul className="space-y-1 border-l border-border">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={`
                -ml-px block border-l-2 py-1 text-[13px] leading-5 transition-colors
                ${item.level === 3 ? 'pl-6' : item.level === 4 ? 'pl-9' : 'pl-3'}
                ${activeId === item.id
                  ? 'border-primary font-medium text-primary'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                }
              `}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="mt-4 flex items-center gap-1.5 border-l border-transparent pl-3 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
        Voltar ao topo
      </button>
    </aside>
  )
}
