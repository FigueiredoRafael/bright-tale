'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Medium } from '@brighttale/shared/pipeline/inputs'
import { estimateProjectCost } from '@/lib/pipeline/cost-estimator'
import type { AiProviderModel, MediaConfig } from '@/lib/pipeline/cost-estimator'
import type { Stage } from '@brighttale/shared/pipeline/inputs'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CostPreviewSlotProps {
  /** Ordered list of media the user has selected (step 2). */
  selectedMedia: Medium[]
  /** Word count from the draft config (drives blog production cost). */
  wordCount: number
  /** Optional model catalog; defaults to empty (uses DEFAULT_MODEL_PRICE fallback). */
  modelCatalog?: AiProviderModel[]
  /** Channel-level defaults. */
  channelDefaults?: MediaConfig
}

// ─── Formatting helper ────────────────────────────────────────────────────────

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function formatUsd(amount: number): string {
  return usd.format(amount)
}

const STAGE_LABELS: Record<Stage, string> = {
  brainstorm: 'Brainstorm',
  research: 'Research',
  canonical: 'Canonical Core',
  production: 'Production',
  review: 'Review',
  assets: 'Assets',
  preview: 'Preview',
  publish: 'Publish',
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CostPreviewSlot({
  selectedMedia,
  wordCount,
  modelCatalog = [],
  channelDefaults,
}: CostPreviewSlotProps) {
  const [stagesOpen, setStagesOpen] = useState(false)

  const channelConfig: MediaConfig = useMemo(
    () => ({
      wordCount,
      ...channelDefaults,
    }),
    [wordCount, channelDefaults],
  )

  const breakdown = useMemo(() => {
    const tracks = selectedMedia.map((m) => ({
      id: m,
      medium: m,
      config: { wordCount: m === 'blog' ? wordCount : undefined },
    }))
    return estimateProjectCost(tracks, channelConfig, modelCatalog)
  }, [selectedMedia, wordCount, channelConfig, modelCatalog])

  const hasMedia = selectedMedia.length > 0

  return (
    <div className="rounded-md border p-3 space-y-3 text-sm" data-testid="wizard-cost-preview">
      {/* Total */}
      <div className="flex items-center justify-between">
        <span className="font-medium">Estimated cost</span>
        <span className="font-semibold text-base">
          {hasMedia ? formatUsd(breakdown.total) : formatUsd(0)}
        </span>
      </div>

      {/* Per-Track breakdown */}
      {hasMedia && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Per track
          </p>
          {selectedMedia.map((m) => (
            <div
              key={m}
              data-testid={`cost-track-${m}`}
              className="flex items-center justify-between"
            >
              <span className="capitalize text-muted-foreground">{m}</span>
              <span>{formatUsd(breakdown.perTrack[m] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Per-Stage breakdown (collapsed by default) */}
      {hasMedia && (
        <div>
          <button
            type="button"
            onClick={() => setStagesOpen((o) => !o)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={stagesOpen}
          >
            {stagesOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Stage breakdown
          </button>
          {stagesOpen && (
            <div className="mt-1.5 space-y-1 pl-4">
              {(Object.keys(breakdown.perStage) as Stage[]).map((stage) => {
                const cost = breakdown.perStage[stage]
                if (cost === 0) return null
                return (
                  <div key={stage} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{STAGE_LABELS[stage]}</span>
                    <span>{formatUsd(cost)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Rough estimate — actual spend may vary by model and iteration count.
      </p>
    </div>
  )
}
