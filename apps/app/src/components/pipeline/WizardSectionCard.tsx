'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface WizardSectionCardProps {
  stage: string
  label: string
  icon: React.ReactNode
  defaultOpen?: boolean
  completed?: boolean
  summary?: string
  children: React.ReactNode
  sectionRef?: React.Ref<HTMLDivElement>
}

export function WizardSectionCard({
  stage,
  label,
  icon,
  defaultOpen = false,
  completed = false,
  summary,
  children,
  sectionRef,
}: WizardSectionCardProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      ref={sectionRef}
      data-testid={`stage-section-${stage}`}
      aria-disabled={completed ? 'true' : undefined}
      className={cn(
        'rounded-lg border transition-colors',
        completed ? 'border-muted bg-muted/20 opacity-60' : 'border-border bg-background',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3 text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        )}
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
        <span className="flex flex-1 items-center gap-2 min-w-0">
          <span className="text-sm font-medium">{label}</span>
          {completed && (
            <Badge variant="secondary" className="text-xs">
              Already done
            </Badge>
          )}
          {!open && !completed && summary && (
            <span className="ml-auto truncate text-xs text-muted-foreground">{summary}</span>
          )}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t px-4 py-3">
          {completed ? (
            <p className="text-sm text-muted-foreground">This stage has already been completed.</p>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  )
}
