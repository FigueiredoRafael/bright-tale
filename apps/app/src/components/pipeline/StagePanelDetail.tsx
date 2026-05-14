'use client'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Lightbulb, Search, FileText, CheckCircle, Image, Eye, Globe,
  ArrowRight, ExternalLink, RotateCcw, AlertCircle, SkipForward,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { deriveTier } from '@brighttale/shared'
import type { PipelineStage } from '@/components/engines/types'
import type { StageResultMap } from '@/lib/pipeline/machine.types'
import type { AutopilotConfig } from '@brighttale/shared'
import {
  STAGE_ICON, STAGE_LABEL, StatusPill, deriveRailStatus,
  type RailStageStatus,
} from './StageRail'

// ── Helpers ───────────────────────────────────────────────────────────────────

interface KpiProps {
  label: string
  value: string | number
  highlight?: boolean
}

function Kpi({ label, value, highlight }: KpiProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={cn('text-xl font-bold tabular-nums', highlight && 'text-primary')}>{value}</span>
    </div>
  )
}

interface HighlightItemProps {
  label: string
  value: string
  mono?: boolean
}

function HighlightItem({ label, value, mono }: HighlightItemProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={cn('text-sm text-foreground break-words', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  )
}

// ── Render the details panel body for a given stage/result ────────────────────

interface DetailBodyProps {
  stage: PipelineStage
  stageResults: StageResultMap
  status: RailStageStatus
  onSkipAssets?: () => void
  onSwitchImageProvider?: (provider: 'openai' | 'gemini') => void
}

/**
 * Filters feedbackJson and latestFeedbackJson keys and summarises object/array values.
 * Ported from CompletedStageSummary.
 */
function renderResultFields(result: Record<string, unknown>, skip: string[] = []) {
  const SKIP_KEYS = new Set(['completedAt', 'feedbackJson', 'latestFeedbackJson', ...skip])
  return Object.entries(result)
    .filter(([k]) => !SKIP_KEYS.has(k))
    .map(([key, value]) => {
      let display: string
      if (Array.isArray(value)) {
        display = value.length === 0 ? '—' : `${value.length} item(s)`
      } else if (value !== null && typeof value === 'object') {
        display = `${Object.keys(value as object).length} field(s)`
      } else {
        display = String(value ?? '—')
      }
      return (
        <div key={key} className="flex gap-2">
          <span className="font-medium text-muted-foreground/70 shrink-0 text-[11px]">{key}:</span>
          <span className="text-[11px] break-all">{display}</span>
        </div>
      )
    })
}

function EmptyState({ status }: { status: RailStageStatus }) {
  // status='done' here means the rail marked the stage Done via gap-fill
  // (downstream completed → work happened, just not via this orchestrator).
  // Tell the user where to look.
  const msg =
    status === 'queued'  ? 'Waiting for previous stage…'
    : status === 'paused'  ? 'Pipeline paused'
    : status === 'failed'  ? 'This stage encountered an error'
    : status === 'skipped' ? 'Stage skipped per autopilot config'
    : status === 'done'    ? 'Completed outside the engine — see the channel page for details.'
    :                        'Stage in progress…'

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <p className="text-muted-foreground/60 text-sm">{msg}</p>
    </div>
  )
}

function DetailBody({ stage, stageResults, status, onSkipAssets, onSwitchImageProvider }: DetailBodyProps) {
  switch (stage) {
    case 'brainstorm': {
      const r = stageResults.brainstorm
      if (!r || !r.completedAt) return <EmptyState status={status} />
      return (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-6">
            <Kpi label="Verdict" value={r.ideaVerdict} highlight />
            {r.brainstormSessionId && (
              <Kpi label="Session" value={r.brainstormSessionId.slice(0, 8) + '…'} />
            )}
          </div>
          <Separator />
          <div className="space-y-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Selected Idea</p>
            <p className="text-lg font-semibold leading-snug">{r.ideaTitle}</p>
            {r.ideaCoreTension && (
              <p className="text-sm text-muted-foreground italic">&ldquo;{r.ideaCoreTension}&rdquo;</p>
            )}
          </div>
        </div>
      )
    }

    case 'research': {
      const r = stageResults.research
      if (!r || !r.completedAt) return <EmptyState status={status} />
      const confidencePct = r.confidenceScore != null ? `${Math.round(r.confidenceScore * 100)}%` : null
      const evidenceColor =
        r.evidenceStrength === 'strong' ? 'text-green-600' :
        r.evidenceStrength === 'moderate' ? 'text-yellow-600' :
        r.evidenceStrength === 'weak' ? 'text-red-500' : ''
      return (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            <Kpi label="Cards approved" value={r.approvedCardsCount} highlight />
            <Kpi label="Depth" value={r.researchLevel} />
            {confidencePct && <Kpi label="Confidence" value={confidencePct} />}
          </div>
          {(r.sourceCount != null || r.expertQuoteCount != null || r.evidenceStrength) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
              {r.sourceCount != null && <Kpi label="Sources" value={r.sourceCount} />}
              {r.expertQuoteCount != null && <Kpi label="Expert quotes" value={r.expertQuoteCount} />}
              {r.evidenceStrength && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Evidence</span>
                  <span className={cn('text-sm font-semibold capitalize', evidenceColor)}>{r.evidenceStrength}</span>
                </div>
              )}
            </div>
          )}
          <Separator />
          <div className="space-y-4">
            {r.researchSummary && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Summary</p>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{r.researchSummary}</p>
              </div>
            )}
            {r.pivotRecommendation && r.pivotRecommendation !== 'proceed' && (
              <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 text-yellow-600 shrink-0" />
                <span className="text-xs text-yellow-800 capitalize">Angle recommendation: {r.pivotRecommendation}</span>
              </div>
            )}
            {r.primaryKeyword && <HighlightItem label="Primary keyword" value={r.primaryKeyword} />}
            {r.secondaryKeywords && r.secondaryKeywords.length > 0 && (
              <HighlightItem
                label={`Secondary keywords (${r.secondaryKeywords.length})`}
                value={r.secondaryKeywords.slice(0, 5).join(' · ')}
              />
            )}
            {r.searchIntent && <HighlightItem label="Search intent" value={r.searchIntent} />}
          </div>
        </div>
      )
    }

    case 'draft': {
      const r = stageResults.draft
      if (!r || !r.completedAt) return <EmptyState status={status} />
      // Rough word count from content
      const wordCount = r.draftContent
        ? r.draftContent.trim().split(/\s+/).filter(Boolean).length
        : 0
      return (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            {wordCount > 0 && <Kpi label="Words" value={wordCount.toLocaleString()} highlight />}
            {r.personaName && <Kpi label="Persona" value={r.personaName} />}
            {r.draftId && <Kpi label="Draft ID" value={r.draftId.slice(0, 8) + '…'} />}
          </div>
          <Separator />
          <div className="space-y-4">
            <HighlightItem label="Title" value={r.draftTitle} />
            {/* Extract H2 headings from draftContent as outline */}
            {r.draftContent && (() => {
              const h2s = r.draftContent.match(/^## .+$/mg) ?? []
              if (h2s.length === 0) return null
              return (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Outline ({h2s.length} sections)
                  </p>
                  <ul className="space-y-1">
                    {h2s.slice(0, 6).map((h, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex gap-2">
                        <span className="text-primary/60 tabular-nums text-[10px] pt-0.5">{i + 1}.</span>
                        <span>{h.replace(/^## /, '')}</span>
                      </li>
                    ))}
                    {h2s.length > 6 && (
                      <li className="text-xs text-muted-foreground/50">+{h2s.length - 6} more sections</li>
                    )}
                  </ul>
                </div>
              )
            })()}
          </div>
        </div>
      )
    }

    case 'review': {
      const r = stageResults.review
      if (!r || !r.completedAt) return <EmptyState status={status} />
      const tier = deriveTier({ quality_tier: r.qualityTier, score: r.score })
      const tierLabel: Record<string, string> = {
        excellent:     'Excellent',
        good:          'Good',
        needs_revision:'Needs Revision',
        reject:        'Rejected',
        not_requested: 'Not Reviewed',
      }
      const tierColor: Record<string, string> = {
        excellent:     'text-green-600 dark:text-green-400',
        good:          'text-blue-600 dark:text-blue-400',
        needs_revision:'text-amber-600 dark:text-amber-400',
        reject:        'text-destructive',
        not_requested: 'text-muted-foreground',
      }
      return (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            <Kpi label="Score" value={`${r.score}/100`} highlight />
            <Kpi label="Iterations" value={r.iterationCount} />
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tier</span>
              <span className={cn('text-xl font-bold', tierColor[tier] ?? 'text-foreground')}>
                {tierLabel[tier] ?? 'Unknown'}
              </span>
            </div>
          </div>
          <Separator />
          {r.iterations && r.iterations.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Iteration history
              </p>
              <ul className="space-y-2">
                {r.iterations.map((it) => (
                  <li key={it.iterationNum} className="text-sm flex gap-2 items-baseline">
                    <span className="font-medium text-muted-foreground/70 shrink-0 tabular-nums text-[11px]">#{it.iterationNum}</span>
                    <span className="font-semibold tabular-nums">{it.score}/100</span>
                    <span className="text-muted-foreground/70 text-[11px]">{it.verdict}</span>
                    {it.oneLineSummary && (
                      <span className="text-muted-foreground text-[11px] italic truncate">&ldquo;{it.oneLineSummary}&rdquo;</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )
    }

    case 'assets': {
      const r = stageResults.assets
      if (!r || !r.completedAt) return <EmptyState status={status} />

      // Persisted error state — autopilot is blocked; user must act.
      if (!('assetIds' in r) && (r as { errorCode?: string }).errorCode) {
        const errorCode = (r as { errorCode: string }).errorCode
        const isQuota = errorCode === 'QUOTA_EXCEEDED'
        return (
          <div className="flex flex-col items-center justify-center py-12 gap-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div className="space-y-1.5">
              <p className="font-semibold text-sm">
                {isQuota ? 'Image generation quota exceeded' : 'Image generation failed'}
              </p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {isQuota
                  ? 'The free-tier daily limit has been reached. Switch to another provider or skip this stage.'
                  : 'An error occurred during image generation. You can retry with a different provider or skip.'}
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-[200px]">
              {onSwitchImageProvider && (
                <Button size="sm" onClick={() => onSwitchImageProvider('openai')}>
                  Retry with OpenAI
                </Button>
              )}
              {onSkipAssets && (
                <Button variant="outline" size="sm" onClick={onSkipAssets}>
                  <SkipForward className="h-3.5 w-3.5 mr-1.5" />
                  Skip images
                </Button>
              )}
            </div>
          </div>
        )
      }

      const assetIds = r.assetIds ?? []
      return (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-6">
            <Kpi label="Assets" value={r.skipped ? 'Skipped' : assetIds.length} highlight={!r.skipped} />
            {r.featuredImageUrl && <Kpi label="Featured image" value="Set" />}
          </div>
          {!r.skipped && r.featuredImageUrl && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Featured image</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.featuredImageUrl}
                  alt="Featured"
                  className="rounded-lg max-h-40 object-cover"
                />
              </div>
            </>
          )}
          {assetIds.length > 0 && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Asset IDs</p>
                <ul className="space-y-0.5">
                  {assetIds.slice(0, 5).map((id) => (
                    <li key={id} className="text-[11px] font-mono text-muted-foreground">{id}</li>
                  ))}
                  {assetIds.length > 5 && (
                    <li className="text-[11px] text-muted-foreground/50">+{assetIds.length - 5} more</li>
                  )}
                </ul>
              </div>
            </>
          )}
        </div>
      )
    }

    case 'preview': {
      const r = stageResults.preview
      if (!r || !r.completedAt) return <EmptyState status={status} />
      const categories = r.categories ?? []
      const tags = r.tags ?? []
      const seo = r.seoOverrides ?? {}
      return (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            <Kpi label="Categories" value={categories.length} />
            <Kpi label="Tags" value={tags.length} />
            {r.suggestedPublishDate && <Kpi label="Publish date" value={new Date(r.suggestedPublishDate).toLocaleDateString()} />}
          </div>
          <Separator />
          <div className="space-y-4">
            {seo.title && <HighlightItem label="SEO title" value={seo.title} />}
            {seo.slug && <HighlightItem label="Slug" value={seo.slug} mono />}
            {seo.metaDescription && (
              <HighlightItem label="Meta description" value={seo.metaDescription} />
            )}
            {categories.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Categories</p>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => (
                    <Badge key={c} variant="secondary" className="text-[11px]">{c}</Badge>
                  ))}
                </div>
              </div>
            )}
            {tags.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.slice(0, 10).map((t) => (
                    <Badge key={t} variant="outline" className="text-[11px]">{t}</Badge>
                  ))}
                  {tags.length > 10 && (
                    <Badge variant="ghost" className="text-[11px]">+{tags.length - 10}</Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )
    }

    case 'publish': {
      const r = stageResults.publish
      if (!r || !r.completedAt) return <EmptyState status={status} />
      return (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-6">
            <Kpi label="Post ID" value={r.wordpressPostId} highlight />
          </div>
          <Separator />
          <div className="space-y-4">
            {r.publishedUrl && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Published URL</p>
                <a
                  href={r.publishedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1.5 break-all"
                >
                  {r.publishedUrl}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            )}
          </div>
        </div>
      )
    }

    default:
      return <EmptyState status={status} />
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

interface StagePanelDetailProps {
  /** The stage being displayed in the panel. */
  selectedStage: PipelineStage
  /** The live/running stage (may differ from selectedStage). */
  currentStage: PipelineStage
  stageResults: StageResultMap
  paused: boolean
  subState: string
  autopilotConfig: AutopilotConfig | null
  onOpenEngine: (stage: PipelineStage) => void
  onRedoFrom?: (stage: PipelineStage) => void
  /** Jump back to the live stage. */
  onBackToLive: () => void
  onSkipAssets?: () => void
  onSwitchImageProvider?: (provider: 'openai' | 'gemini') => void
  /** Stages with completed `stage_runs` rows — DB fallback for Done. */
  completedFromStageRuns?: ReadonlySet<PipelineStage>
}

export function StagePanelDetail({
  selectedStage,
  currentStage,
  stageResults,
  paused,
  subState,
  autopilotConfig,
  onOpenEngine,
  onRedoFrom,
  onBackToLive,
  onSkipAssets,
  onSwitchImageProvider,
  completedFromStageRuns,
}: StagePanelDetailProps) {
  const Icon = STAGE_ICON[selectedStage]
  const status = deriveRailStatus(
    selectedStage, currentStage, stageResults, paused, subState, autopilotConfig,
    completedFromStageRuns,
  )
  const isLive = selectedStage === currentStage
  const hasResult = !!(stageResults[selectedStage] as { completedAt?: string } | undefined)?.completedAt

  return (
    <div
      data-testid={`stage-panel-${selectedStage}`}
      className="flex flex-col h-full min-h-0"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">{STAGE_LABEL[selectedStage]}</h3>
              <StatusPill status={status} />
            </div>
            {hasResult && stageResults[selectedStage] && (() => {
              const r = stageResults[selectedStage] as unknown as Record<string, unknown>
              const completedAt = r.completedAt as string | undefined
              if (!completedAt) return null
              return (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Completed {new Date(completedAt).toLocaleString()}
                </p>
              )
            })()}
          </div>
        </div>

        {/* Back-to-live pill */}
        {!isLive && (
          <Button
            variant="outline"
            size="sm"
            data-testid="back-to-live-btn"
            onClick={onBackToLive}
            className="shrink-0 text-xs gap-1.5 h-7"
          >
            <ArrowRight className="h-3 w-3" />
            Back to live
          </Button>
        )}
      </div>

      {/* Detail body — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <DetailBody
          stage={selectedStage}
          stageResults={stageResults}
          status={status}
          onSkipAssets={onSkipAssets}
          onSwitchImageProvider={onSwitchImageProvider}
        />
      </div>

      {/* Footer escape-hatch */}
      {(hasResult || status === 'running') && (
        <div className="mt-6 pt-4 border-t border-border/50 flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            data-testid={`open-engine-${selectedStage}`}
            className="text-xs gap-1.5"
            onClick={() => onOpenEngine(selectedStage)}
          >
            Open engine
            <ArrowRight className="h-3 w-3" />
          </Button>
          {hasResult && onRedoFrom && (
            <Button
              variant="ghost"
              size="sm"
              data-testid={`redo-from-${selectedStage}`}
              className="text-xs gap-1.5 text-muted-foreground"
              onClick={() => onRedoFrom(selectedStage)}
            >
              <RotateCcw className="h-3 w-3" />
              Redo from here
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
