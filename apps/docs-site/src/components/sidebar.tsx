'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { navigation, type NavItem, type NavSection } from '@/src/lib/nav-config'

function NavLink({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const pathname = usePathname()
  const isActive = pathname === item.href
  const isParentActive = item.href ? pathname.startsWith(item.href + '/') : false
  const [isOpen, setIsOpen] = useState(isActive || isParentActive)

  const hasChildren = item.children && item.children.length > 0

  return (
    <li>
      <div className="flex items-center">
        {item.href ? (
          <Link
            href={item.href}
            onClick={() => hasChildren && setIsOpen(true)}
            className={`
              flex-1 rounded-md py-1.5 text-[13px] leading-6 transition-colors
              ${depth > 0 ? 'pl-3' : 'font-medium'}
              ${isActive
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }
              ${depth > 0 ? 'ml-0' : ''}
            `}
            style={depth > 0 ? { paddingLeft: `${depth * 12 + 8}px` } : undefined}
          >
            {item.title}
          </Link>
        ) : (
          <span className="flex-1 py-1.5 text-[13px] font-medium text-foreground">
            {item.title}
          </span>
        )}
        {hasChildren && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            <svg
              className={`h-3 w-3 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
      {hasChildren && isOpen && (
        <ul className="relative ml-3 mt-0.5 space-y-0.5 before:absolute before:bottom-1 before:left-0 before:top-0 before:w-px before:bg-border">
          {item.children!.map((child) => (
            <NavLink key={child.href ?? child.title} item={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

function SectionGroup({ section }: { section: NavSection }) {
  return (
    <div className="mb-5">
      {section.title && (
        <h4 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          {section.title}
        </h4>
      )}
      <ul className="space-y-0.5">
        {section.items.map((item) => (
          <NavLink key={item.href ?? item.title} item={item} />
        ))}
      </ul>
    </div>
  )
}

function SidebarContent() {
  return (
    <nav className="space-y-1">
      {navigation.map((section, i) => (
        <SectionGroup key={section.title ?? i} section={section} />
      ))}
    </nav>
  )
}

export function Sidebar() {
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-border px-3 py-5 lg:block">
      <SidebarContent />
    </aside>
  )
}

export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto border-r border-border bg-background px-3 py-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between px-1">
          <span className="text-sm font-semibold">Menu</span>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <SidebarContent />
      </aside>
    </>
  )
}
