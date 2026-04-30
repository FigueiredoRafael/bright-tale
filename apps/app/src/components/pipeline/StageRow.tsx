'use client'
import { Check, CircleDashed, Loader2, Minus } from 'lucide-react'
import type { PipelineStage } from '@/components/engines/types'
import type { ReviewIterationSummary } from '@brighttale/shared'

export type StageRowState = 'pending' | 'running' | 'completed' | 'skipped'

interface StageRowProps {
  stage: PipelineStage
  label: string
  state: StageRowState
  status?: string
  current?: number
  total?: number
  detail?: string
  summary?: string
  iterations?: ReviewIterationSummary[]
  onOpenEngine?: () => void
}

export function StageRow({ stage, label, state, status, current, total, detail, summary, iterations, onOpenEngine }: StageRowProps) {
  const Icon = state === 'completed' ? Check
            : state === 'running'   ? Loader2
            : state === 'skipped'   ? Minus
            :                          CircleDashed
  return (
    <div data-testid={`stage-row-${stage}`} className={state === 'running' ? 'border-l-2 border-primary pl-3 py-1.5 animate-pulse' : 'pl-3 py-1.5'}>
      <div className="flex items-center gap-2">
        <Icon className={state === 'running' ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        <span className="font-medium text-sm">{label}</span>
        {state === 'completed' && summary && <span className="text-xs text-muted-foreground">{summary}</span>}
        {onOpenEngine && state === 'completed' && (
          <button onClick={onOpenEngine} className="ml-auto text-xs text-primary hover:underline">Open engine →</button>
        )}
      </div>
      {stage === 'review' && state === 'running' && iterations && iterations.length > 0 && (
        <div className="ml-6 mt-1 space-y-0.5">
          {iterations.slice(0, -1).map((it: ReviewIterationSummary) => (
            <p key={it.iterationNum} className="text-[11px] text-muted-foreground">
              Iter {it.iterationNum}: {it.score}/100 · {it.verdict} · &ldquo;{it.oneLineSummary}&rdquo;
            </p>
          ))}
        </div>
      )}
      {state === 'running' && status && (
        <p className="ml-6 mt-0.5 text-xs text-muted-foreground">{status}</p>
      )}
      {state === 'running' && typeof current === 'number' && typeof total === 'number' && total > 0 && (
        <div className="ml-6 mt-1 h-1 bg-muted rounded overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${(current / total) * 100}%` }} />
        </div>
      )}
      {detail && <p className="ml-6 mt-0.5 text-[11px] text-muted-foreground italic">{detail}</p>}
    </div>
  )
}
