'use client'

import { Controller, useFormContext } from 'react-hook-form'
import { List, Eye, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WizardFormValues {
  mode: 'step-by-step' | 'supervised' | 'overview'
  [key: string]: unknown
}

interface ModeOption {
  value: 'step-by-step' | 'supervised' | 'overview'
  label: string
  description: string
  Icon: React.ComponentType<{ className?: string }>
}

const MODE_OPTIONS: ModeOption[] = [
  {
    value: 'step-by-step',
    label: 'Step-by-step',
    description: 'You drive every stage manually',
    Icon: List,
  },
  {
    value: 'supervised',
    label: 'Supervised',
    description: 'AI runs each stage, pauses for your approval',
    Icon: Eye,
  },
  {
    value: 'overview',
    label: 'Overview',
    description: 'AI runs all stages end-to-end, notifies when done',
    Icon: Rocket,
  },
]

export function WizardModeCards() {
  const { control } = useFormContext<WizardFormValues>()

  return (
    <Controller
      control={control}
      name="mode"
      render={({ field }) => (
        <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Pipeline mode">
          {MODE_OPTIONS.map(({ value, label, description, Icon }) => {
            const selected = field.value === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={label}
                onClick={() => field.onChange(value)}
                className={cn(
                  'flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-all duration-150',
                  'hover:border-primary/50 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border bg-background',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                    selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className={cn('text-sm font-medium', selected && 'text-primary')}>{label}</span>
                  <span className="text-xs text-muted-foreground">{description}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    />
  )
}
