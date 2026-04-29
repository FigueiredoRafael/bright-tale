'use client'

import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { autopilotConfigSchema } from '@brighttale/shared'
import type { AutopilotConfig } from '@brighttale/shared'
import { usePipelineActor } from '@/hooks/usePipelineActor'
import { usePipelineSettings } from '@/providers/PipelineSettingsProvider'
import type { StageResultMap } from '@/lib/pipeline/machine.types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

// ─── Inline form schema ──────────────────────────────────────────────────────
// Mirrors autopilotConfigSchema with string-coerced numbers for HTML inputs.
const formSchema = z.object({
  mode: z.enum(['supervised', 'overview']),
  defaultProvider: z.union([z.literal('recommended'), z.enum(['openai', 'anthropic', 'gemini', 'ollama'])]),
  brainstorm: z.object({
    providerOverride: z.enum(['openai', 'anthropic', 'gemini', 'ollama']).nullable(),
    brainstormMode: z.enum(['topic_driven', 'reference_guided']),
    topic: z.string().optional().nullable(),
    referenceUrl: z.string().optional().nullable(),
    niche: z.string().optional(),
    tone: z.string().optional(),
    audience: z.string().optional(),
    goal: z.string().optional(),
    constraints: z.string().optional(),
  }).nullable(),
  research: z.object({
    providerOverride: z.enum(['openai', 'anthropic', 'gemini', 'ollama']).nullable(),
    depth: z.enum(['surface', 'medium', 'deep']),
  }).nullable(),
  canonicalCore: z.object({
    providerOverride: z.enum(['openai', 'anthropic', 'gemini', 'ollama']).nullable(),
    personaId: z.string().nullable(),
  }),
  draft: z.object({
    providerOverride: z.enum(['openai', 'anthropic', 'gemini', 'ollama']).nullable(),
    format: z.enum(['blog', 'video', 'shorts', 'podcast']),
    wordCount: z.coerce.number().int().positive().optional(),
  }),
  review: z.object({
    providerOverride: z.enum(['openai', 'anthropic', 'gemini', 'ollama']).nullable(),
    maxIterations: z.coerce.number().int().min(0).max(20),
    autoApproveThreshold: z.coerce.number().int().min(0).max(100),
    hardFailThreshold: z.coerce.number().int().min(0).max(100),
  }).superRefine((v, ctx) => {
    if (v.hardFailThreshold >= v.autoApproveThreshold) {
      ctx.addIssue({
        code: 'custom',
        path: ['hardFailThreshold'],
        message: 'Must be lower than auto-approve threshold (else infinite loop)',
      })
    }
  }),
  assets: z.object({
    providerOverride: z.enum(['openai', 'anthropic', 'gemini', 'ollama']).nullable(),
    assetMode: z.enum(['skip', 'manual', 'briefing', 'auto']),
  }),
})

type FormValues = z.infer<typeof formSchema>

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ValidProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama'
const VALID_PROVIDERS: ValidProvider[] = ['openai', 'anthropic', 'gemini', 'ollama']

function toProviderOrNull(raw: string | undefined | null): ValidProvider | null {
  if (!raw) return null
  return (VALID_PROVIDERS.includes(raw as ValidProvider) ? raw : null) as ValidProvider | null
}

function defaultProviderFor(
  key: string,
  defaultProviders: Record<string, string>,
): ValidProvider | null {
  return toProviderOrNull(defaultProviders[key] ?? defaultProviders['draft'] ?? null)
}

function buildDefaultValues(
  existing: AutopilotConfig | null,
  defaultProviders: Record<string, string>,
  reviewApproveScore: number,
  reviewRejectThreshold: number,
  reviewMaxIterations: number,
  brainstormDone: boolean,
  researchDone: boolean,
): FormValues {
  if (existing !== null) {
    return {
      mode: 'supervised',
      defaultProvider: existing.defaultProvider ?? 'recommended',
      // If stage is already done in stageResults, keep slot null regardless
      brainstorm: brainstormDone
        ? null
        : existing.brainstorm
          ? {
              providerOverride: existing.brainstorm.providerOverride,
              brainstormMode: existing.brainstorm.mode,
              topic: existing.brainstorm.topic ?? null,
              referenceUrl: existing.brainstorm.referenceUrl ?? null,
              niche: existing.brainstorm.niche ?? '',
              tone: existing.brainstorm.tone ?? '',
              audience: existing.brainstorm.audience ?? '',
              goal: existing.brainstorm.goal ?? '',
              constraints: existing.brainstorm.constraints ?? '',
            }
          : null,
      research: researchDone
        ? null
        : existing.research
          ? {
              providerOverride: existing.research.providerOverride,
              depth: existing.research.depth,
            }
          : null,
      canonicalCore: {
        providerOverride: existing.canonicalCore.providerOverride,
        personaId: existing.canonicalCore.personaId,
      },
      draft: {
        providerOverride: existing.draft.providerOverride,
        format: existing.draft.format,
        wordCount: existing.draft.wordCount,
      },
      review: {
        providerOverride: existing.review.providerOverride,
        maxIterations: existing.review.maxIterations,
        autoApproveThreshold: existing.review.autoApproveThreshold,
        hardFailThreshold: existing.review.hardFailThreshold,
      },
      assets: {
        providerOverride: existing.assets.providerOverride,
        assetMode: existing.assets.mode,
      },
    }
  }

  return {
    mode: 'supervised',
    defaultProvider: 'recommended',
    // If stage is already done, use null so we don't re-run it
    brainstorm: brainstormDone
      ? null
      : {
          providerOverride: defaultProviderFor('brainstorm', defaultProviders),
          brainstormMode: 'topic_driven',
          topic: null,
          referenceUrl: null,
          niche: '',
          tone: '',
          audience: '',
          goal: '',
          constraints: '',
        },
    research: researchDone
      ? null
      : {
          providerOverride: defaultProviderFor('research', defaultProviders),
          depth: 'medium',
        },
    canonicalCore: {
      providerOverride: defaultProviderFor('draft', defaultProviders),
      personaId: null,
    },
    draft: {
      providerOverride: defaultProviderFor('draft', defaultProviders),
      format: 'blog',
      wordCount: 1500,
    },
    review: {
      providerOverride: defaultProviderFor('review', defaultProviders),
      maxIterations: reviewMaxIterations,
      autoApproveThreshold: reviewApproveScore,
      hardFailThreshold: reviewRejectThreshold,
    },
    assets: {
      providerOverride: null,
      assetMode: 'skip',
    },
  }
}

function formValuesToAutopilotConfig(values: FormValues): AutopilotConfig {
  return {
    defaultProvider: values.defaultProvider,
    brainstorm: values.brainstorm
      ? {
          providerOverride: values.brainstorm.providerOverride,
          mode: values.brainstorm.brainstormMode,
          topic: values.brainstorm.topic ?? undefined,
          referenceUrl: values.brainstorm.referenceUrl ?? undefined,
          niche: values.brainstorm.niche,
          tone: values.brainstorm.tone,
          audience: values.brainstorm.audience,
          goal: values.brainstorm.goal,
          constraints: values.brainstorm.constraints,
        }
      : null,
    research: values.research
      ? {
          providerOverride: values.research.providerOverride,
          depth: values.research.depth,
        }
      : null,
    canonicalCore: {
      providerOverride: values.canonicalCore.providerOverride,
      personaId: values.canonicalCore.personaId,
    },
    draft: {
      providerOverride: values.draft.providerOverride,
      format: values.draft.format,
      wordCount: values.draft.wordCount,
    },
    review: {
      providerOverride: values.review.providerOverride,
      maxIterations: values.review.maxIterations,
      autoApproveThreshold: values.review.autoApproveThreshold,
      hardFailThreshold: values.review.hardFailThreshold,
    },
    assets: {
      providerOverride: values.assets.providerOverride,
      mode: values.assets.assetMode,
    },
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CompletedCardProps {
  stage: 'brainstorm' | 'research'
  stageResults: StageResultMap
}

function CompletedCard({ stage, stageResults }: CompletedCardProps) {
  const result = stageResults[stage]
  if (!result) return null

  let summary = ''
  if (stage === 'brainstorm') {
    const r = stageResults.brainstorm
    summary = r ? `${r.ideaTitle} · ${r.ideaVerdict}` : ''
  } else if (stage === 'research') {
    const r = stageResults.research
    summary = r ? `${r.approvedCardsCount} cards approved · ${r.researchLevel} depth` : ''
  }

  return (
    <div
      data-testid={`completed-card-${stage}`}
      className="rounded-md border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm"
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {stage}
        </span>
        <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-700 dark:text-green-400">
          Done
        </span>
      </div>
      <p className="mt-1 text-muted-foreground">{summary}</p>
    </div>
  )
}

interface ProviderSelectProps {
  testId: string
  value: ValidProvider | null
  onChange: (v: ValidProvider | null) => void
  disabled?: boolean
}

function ProviderSelect({ testId, value, onChange, disabled = false }: ProviderSelectProps) {
  return (
    <select
      data-testid={testId}
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => onChange(toProviderOrNull(e.target.value))}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="">Auto (default)</option>
      {VALID_PROVIDERS.map((p) => (
        <option key={p} value={p}>
          {p.charAt(0).toUpperCase() + p.slice(1)}
        </option>
      ))}
    </select>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MiniWizardSheetProps {
  isOpen: boolean
  onClose: () => void
}

export function MiniWizardSheet({ isOpen, onClose }: MiniWizardSheetProps) {
  const actor = usePipelineActor()
  const { pipelineSettings } = usePipelineSettings()

  const snapshot = actor.getSnapshot()
  const { autopilotConfig, stageResults } = snapshot.context
  const { defaultProviders, reviewApproveScore, reviewRejectThreshold, reviewMaxIterations } =
    pipelineSettings

  const brainstormDone = Boolean(
    stageResults.brainstorm &&
      (stageResults.brainstorm as { completedAt?: string }).completedAt,
  )
  const researchDone = Boolean(
    stageResults.research &&
      (stageResults.research as { completedAt?: string }).completedAt,
  )

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefaultValues(
      autopilotConfig,
      defaultProviders,
      reviewApproveScore,
      reviewRejectThreshold,
      reviewMaxIterations,
      brainstormDone,
      researchDone,
    ),
  })

  const brainstormProvider = useWatch({ control, name: 'brainstorm.providerOverride' }) as ValidProvider | null
  const researchProvider = useWatch({ control, name: 'research.providerOverride' }) as ValidProvider | null
  const canonicalCoreProvider = useWatch({ control, name: 'canonicalCore.providerOverride' }) as ValidProvider | null
  const draftProvider = useWatch({ control, name: 'draft.providerOverride' }) as ValidProvider | null
  const reviewProvider = useWatch({ control, name: 'review.providerOverride' }) as ValidProvider | null
  const assetsProvider = useWatch({ control, name: 'assets.providerOverride' }) as ValidProvider | null

  function onSubmit(values: FormValues) {
    const config = formValuesToAutopilotConfig(values)

    // Full parse to ensure validity before dispatch — will throw on invalid config
    // and react-hook-form's zodResolver should have caught it first, but we
    // double-check here as the plan's contract test requires parse() to succeed.
    const parsed = autopilotConfigSchema.parse(config)

    actor.send({
      type: 'GO_AUTOPILOT',
      mode: values.mode,
      autopilotConfig: parsed,
    })
    onClose()
  }

  // Extra inline check for the hardFail/autoApprove cross-field validation
  // (zodResolver handles it, but we read the error for display)
  const hardFailError =
    errors.review?.hardFailThreshold?.message ??
    (errors.review as { root?: { message?: string } } | undefined)?.root?.message

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Switch to Autopilot</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 py-2">
          {/* ── Autopilot mode ─────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="autopilot-mode">Autopilot mode</Label>
            <select
              id="autopilot-mode"
              {...register('mode')}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="supervised">Supervised — pause at each stage for review</option>
              <option value="overview">Overview — run all stages, notify when done</option>
            </select>
          </div>

          {/* ── Brainstorm slot ─────────────────────────────── */}
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">Brainstorm</h3>
            {brainstormDone ? (
              <CompletedCard stage="brainstorm" stageResults={stageResults} />
            ) : (
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <ProviderSelect
                  testId="brainstorm-provider-select"
                  value={brainstormProvider}
                  onChange={(v) => setValue('brainstorm.providerOverride', v)}
                />
                <Label htmlFor="brainstorm-mode-select">Mode</Label>
                <select
                  id="brainstorm-mode-select"
                  {...register('brainstorm.brainstormMode')}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="topic_driven">Topic-driven</option>
                  <option value="reference_guided">Reference-guided</option>
                </select>
              </div>
            )}
          </section>

          {/* ── Research slot ─────────────────────────────── */}
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">Research</h3>
            {researchDone ? (
              <CompletedCard stage="research" stageResults={stageResults} />
            ) : (
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <ProviderSelect
                  testId="research-provider-select"
                  value={researchProvider}
                  onChange={(v) => setValue('research.providerOverride', v)}
                />
                <Label htmlFor="research-depth">Depth</Label>
                <select
                  id="research-depth"
                  {...register('research.depth')}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="surface">Surface</option>
                  <option value="medium">Medium</option>
                  <option value="deep">Deep</option>
                </select>
              </div>
            )}
          </section>

          {/* ── Canonical core slot ────────────────────────── */}
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">Canonical Core</h3>
            <Label>Provider</Label>
            <ProviderSelect
              testId="canonical-core-provider-select"
              value={canonicalCoreProvider}
              onChange={(v) => setValue('canonicalCore.providerOverride', v)}
            />
          </section>

          {/* ── Draft slot ─────────────────────────────────── */}
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">Draft</h3>
            <Label>Provider</Label>
            <ProviderSelect
              testId="draft-provider-select"
              value={draftProvider}
              onChange={(v) => setValue('draft.providerOverride', v)}
            />
            <Label htmlFor="draft-format">Format</Label>
            <select
              id="draft-format"
              {...register('draft.format')}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="blog">Blog</option>
              <option value="video">Video</option>
              <option value="shorts">Shorts</option>
              <option value="podcast">Podcast</option>
            </select>
            <Label htmlFor="draft-word-count">Word count</Label>
            <input
              id="draft-word-count"
              type="number"
              {...register('draft.wordCount')}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </section>

          {/* ── Review slot ────────────────────────────────── */}
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">Review</h3>
            <Label>Provider</Label>
            <ProviderSelect
              testId="review-provider-select"
              value={reviewProvider}
              onChange={(v) => setValue('review.providerOverride', v)}
            />
            <Label htmlFor="review-max-iterations">Max iterations</Label>
            <input
              id="review-max-iterations"
              type="number"
              {...register('review.maxIterations')}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Label htmlFor="review-auto-approve">Auto-approve threshold</Label>
            <input
              id="review-auto-approve"
              data-testid="review-auto-approve-threshold"
              type="number"
              {...register('review.autoApproveThreshold')}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Label htmlFor="review-hard-fail">Hard-fail threshold</Label>
            <input
              id="review-hard-fail"
              data-testid="review-hard-fail-threshold"
              type="number"
              {...register('review.hardFailThreshold')}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {hardFailError && (
              <p className="text-sm text-destructive" role="alert">
                Hard-fail threshold must be lower than auto-approve threshold (else infinite loop)
              </p>
            )}
          </section>

          {/* ── Assets slot ────────────────────────────────── */}
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">Assets</h3>
            <Label>Provider</Label>
            <ProviderSelect
              testId="assets-provider-select"
              value={assetsProvider}
              onChange={(v) => setValue('assets.providerOverride', v)}
            />
            <Label htmlFor="assets-mode">Mode</Label>
            <select
              id="assets-mode"
              {...register('assets.assetMode')}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="skip">Skip</option>
              <option value="manual">Manual</option>
              <option value="briefing">Briefing</option>
              <option value="auto">Auto</option>
            </select>
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Activate Autopilot</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
