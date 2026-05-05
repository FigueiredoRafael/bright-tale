'use client'

import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { autopilotConfigSchema } from '@brighttale/shared'
import type { AutopilotConfig } from '@brighttale/shared'
import { usePipelineActor } from '@/hooks/usePipelineActor'
import { usePipelineSettings } from '@/providers/PipelineSettingsProvider'
import { MODELS_BY_PROVIDER, type ProviderId } from '@/components/ai/ModelPicker'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'

// ─── Provider data ────────────────────────────────────────────────────────────

interface ProviderOption {
  provider: string
  models: string[]
}

const PROVIDER_LABELS: Record<string, string> = {
  gemini:    'Gemini (Google)',
  openai:    'OpenAI',
  anthropic: 'Anthropic (Claude)',
  ollama:    'Ollama (local)',
}

// ─── Form schema ─────────────────────────────────────────────────────────────

const formSchema = z.object({
  mode: z.enum(['supervised', 'overview']),
  defaultProvider: z.union([z.literal('recommended'), z.enum(['openai', 'anthropic', 'gemini', 'ollama'])]),
  brainstorm: z.object({
    providerOverride: z.enum(['openai', 'anthropic', 'gemini', 'ollama']).nullable(),
    modelOverride: z.string().nullable().optional(),
    brainstormMode: z.enum(['topic_driven', 'reference_guided']),
    topic: z.string().optional().nullable(),
    referenceUrl: z.string().optional().nullable(),
    niche: z.string().optional(),
    tone: z.string().optional(),
    audience: z.string().optional(),
    goal: z.string().optional(),
    constraints: z.string().optional(),
  }).superRefine((v, ctx) => {
    if (v.brainstormMode === 'topic_driven' && !v.topic) {
      ctx.addIssue({ code: 'custom', path: ['topic'], message: 'Topic required for topic-driven mode' })
    }
    if (v.brainstormMode === 'reference_guided' && !v.referenceUrl) {
      ctx.addIssue({ code: 'custom', path: ['referenceUrl'], message: 'URL required for reference-guided mode' })
    }
  }).nullable(),
  research: z.object({
    providerOverride: z.enum(['openai', 'anthropic', 'gemini', 'ollama']).nullable(),
    modelOverride: z.string().nullable().optional(),
    depth: z.enum(['surface', 'medium', 'deep']),
  }).nullable(),
  canonicalCore: z.object({
    providerOverride: z.enum(['openai', 'anthropic', 'gemini', 'ollama']).nullable(),
    modelOverride: z.string().nullable().optional(),
    personaId: z.string().nullable(),
  }),
  draft: z.object({
    providerOverride: z.enum(['openai', 'anthropic', 'gemini', 'ollama']).nullable(),
    modelOverride: z.string().nullable().optional(),
    format: z.enum(['blog', 'video', 'shorts', 'podcast']),
    wordCount: z.coerce.number().int().positive().optional(),
  }),
  review: z.object({
    providerOverride: z.enum(['openai', 'anthropic', 'gemini', 'ollama']).nullable(),
    modelOverride: z.string().nullable().optional(),
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
    modelOverride: z.string().nullable().optional(),
    assetMode: z.enum(['skip', 'briefs_only', 'auto_generate']),
  }),
  preview: z.object({
    enabled: z.boolean(),
  }),
  publish: z.object({
    status: z.enum(['draft', 'published']),
  }),
})

type FormValues = z.infer<typeof formSchema>
type ValidProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toProviderOrNull(raw: string | undefined | null): ValidProvider | null {
  const valid: ValidProvider[] = ['openai', 'anthropic', 'gemini', 'ollama']
  if (!raw) return null
  return valid.includes(raw as ValidProvider) ? (raw as ValidProvider) : null
}

function sanitizeProviderModel(
  provider: string | null | undefined,
  model: string | null | undefined,
): string | null {
  if (!provider || !model) return model ?? null
  const validIds = (MODELS_BY_PROVIDER[provider as ProviderId] ?? []).map((m) => m.id)
  return validIds.includes(model) ? model : null
}

interface AgentRecs {
  brainstorm?:    { recommended_provider: string | null; recommended_model: string | null }
  research?:      { recommended_provider: string | null; recommended_model: string | null }
  production?:    { recommended_provider: string | null; recommended_model: string | null }
  review?:        { recommended_provider: string | null; recommended_model: string | null }
}

function buildDefaultValues(
  existing: AutopilotConfig | null,
  defaultProviders: Record<string, string>,
  reviewApproveScore: number,
  reviewRejectThreshold: number,
  reviewMaxIterations: number,
  brainstormDone: boolean,
  researchDone: boolean,
  agentRecs: AgentRecs = {},
): FormValues {
  // Helper: pick provider from agent rec → pipeline defaults → null
  function recProvider(stage: keyof AgentRecs): ValidProvider | null {
    return toProviderOrNull(agentRecs[stage]?.recommended_provider ?? defaultProviders[stage] ?? null)
  }
  function recModel(stage: keyof AgentRecs): string | null {
    return agentRecs[stage]?.recommended_model ?? null
  }

  if (existing !== null) {
    return {
      mode: 'supervised',
      defaultProvider: existing.defaultProvider ?? 'recommended',
      brainstorm: brainstormDone
        ? null
        : existing.brainstorm
          ? {
              providerOverride: existing.brainstorm.providerOverride,
              modelOverride: existing.brainstorm.modelOverride ?? null,
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
              modelOverride: existing.research.modelOverride ?? null,
              depth: existing.research.depth,
            }
          : null,
      canonicalCore: {
        providerOverride: existing.canonicalCore.providerOverride,
        modelOverride: existing.canonicalCore.modelOverride ?? null,
        personaId: existing.canonicalCore.personaId,
      },
      draft: {
        providerOverride: existing.draft.providerOverride,
        modelOverride: existing.draft.modelOverride ?? null,
        format: existing.draft.format,
        wordCount: existing.draft.wordCount,
      },
      review: {
        providerOverride: existing.review.providerOverride,
        modelOverride: existing.review.modelOverride ?? null,
        maxIterations: existing.review.maxIterations,
        autoApproveThreshold: existing.review.autoApproveThreshold,
        hardFailThreshold: existing.review.hardFailThreshold,
      },
      assets: {
        providerOverride: existing.assets.providerOverride,
        modelOverride: existing.assets.modelOverride ?? null,
        assetMode: existing.assets.mode,
      },
      preview: { enabled: existing.preview.enabled },
      publish: { status: existing.publish.status },
    }
  }

  // Fresh open — pre-fill from agent recommendations
  return {
    mode: 'supervised',
    defaultProvider: 'recommended',
    brainstorm: brainstormDone
      ? null
      : {
          providerOverride: recProvider('brainstorm'),
          modelOverride: recModel('brainstorm'),
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
          providerOverride: recProvider('research'),
          modelOverride: recModel('research'),
          depth: 'medium',
        },
    canonicalCore: {
      providerOverride: recProvider('production'),
      modelOverride: recModel('production'),
      personaId: null,
    },
    draft: {
      providerOverride: recProvider('production'),
      modelOverride: recModel('production'),
      format: 'blog',
      wordCount: 1500,
    },
    review: {
      providerOverride: recProvider('review'),
      modelOverride: recModel('review'),
      maxIterations: reviewMaxIterations,
      autoApproveThreshold: reviewApproveScore,
      hardFailThreshold: reviewRejectThreshold,
    },
    assets: {
      providerOverride: null,
      modelOverride: null,
      assetMode: 'skip',
    },
    preview: { enabled: false },
    publish: { status: 'draft' },
  }
}

function formValuesToAutopilotConfig(values: FormValues): AutopilotConfig {
  return {
    defaultProvider: values.defaultProvider,
    brainstorm: values.brainstorm
      ? {
          providerOverride: values.brainstorm.providerOverride,
          modelOverride: sanitizeProviderModel(values.brainstorm.providerOverride, values.brainstorm.modelOverride),
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
          modelOverride: sanitizeProviderModel(values.research.providerOverride, values.research.modelOverride),
          depth: values.research.depth,
        }
      : null,
    canonicalCore: {
      providerOverride: values.canonicalCore.providerOverride,
      modelOverride: sanitizeProviderModel(values.canonicalCore.providerOverride, values.canonicalCore.modelOverride),
      personaId: values.canonicalCore.personaId,
    },
    draft: {
      providerOverride: values.draft.providerOverride,
      modelOverride: sanitizeProviderModel(values.draft.providerOverride, values.draft.modelOverride),
      format: values.draft.format,
      wordCount: values.draft.wordCount,
    },
    review: {
      providerOverride: values.review.providerOverride,
      modelOverride: sanitizeProviderModel(values.review.providerOverride, values.review.modelOverride),
      maxIterations: values.review.maxIterations,
      autoApproveThreshold: values.review.autoApproveThreshold,
      hardFailThreshold: values.review.hardFailThreshold,
    },
    assets: {
      providerOverride: values.assets.providerOverride,
      modelOverride: sanitizeProviderModel(values.assets.providerOverride, values.assets.modelOverride),
      mode: values.assets.assetMode,
    },
    preview: { enabled: values.preview.enabled },
    publish: { status: values.publish.status },
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

// ─── ProviderModelPicker ─────────────────────────────────────────────────────

interface ProviderModelPickerProps {
  testId: string
  providerValue: ValidProvider | null
  modelValue: string | null | undefined
  onProviderChange: (v: ValidProvider | null) => void
  onModelChange: (v: string | null) => void
  providers: ProviderOption[]
  disabled?: boolean
}

function ProviderModelPicker({
  testId,
  providerValue,
  modelValue,
  onProviderChange,
  onModelChange,
  providers,
  disabled = false,
}: ProviderModelPickerProps) {
  const selectedProvider = providers.find(p => p.provider === providerValue)
  const models = selectedProvider?.models ?? []

  const selectClass = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"

  return (
    <div className="space-y-1.5">
      {/* Provider dropdown */}
      <select
        data-testid={testId}
        disabled={disabled}
        value={providerValue ?? ''}
        onChange={(e) => {
          onProviderChange(toProviderOrNull(e.target.value))
          onModelChange(null)
        }}
        className={selectClass}
      >
        <option value="">Auto (use agent default)</option>
        {providers.map(p => (
          <option key={p.provider} value={p.provider}>
            {PROVIDER_LABELS[p.provider] ?? p.provider}
          </option>
        ))}
      </select>

      {/* Model picker — only shown when a provider is selected */}
      {providerValue && (
        models.length > 0 ? (
          <select
            data-testid={`${testId}-model`}
            disabled={disabled}
            value={modelValue ?? ''}
            onChange={(e) => onModelChange(e.target.value || null)}
            className={selectClass}
          >
            <option value="">Default model</option>
            {models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        ) : (
          <input
            data-testid={`${testId}-model`}
            type="text"
            disabled={disabled}
            value={modelValue ?? ''}
            onChange={(e) => onModelChange(e.target.value || null)}
            placeholder="Model name (optional)"
            className={selectClass}
          />
        )
      )}
    </div>
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

  const [activeProviders, setActiveProviders] = useState<ProviderOption[]>([])
  const [loadingProviders, setLoadingProviders] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
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

  // Fetch active providers + agent recommendations when wizard opens
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoadingProviders(true)

    async function load() {
      try {
        const [provRes, agentRes] = await Promise.all([
          fetch('/api/ai-providers'),
          fetch('/api/agents'),
        ])
        if (cancelled) return

        const provJson = await provRes.json()
        const agentJson = await agentRes.json()

        const providers: ProviderOption[] = (provJson.data ?? [])
          .filter((p: { isActive: boolean; provider: string }) => p.isActive && p.provider !== 'manual')
          .map((p: { provider: string; modelsJson: string[] }) => ({
            provider: p.provider,
            models: p.modelsJson ?? [],
          }))

        if (cancelled) return
        setActiveProviders(providers)

        // Pre-fill agent recommendations only when opening fresh (no saved config)
        if (!autopilotConfig) {
          const agents: Array<{ stage: string; recommended_provider: string | null; recommended_model: string | null }> =
            agentJson.data?.agents ?? []
          const agentRecs: AgentRecs = Object.fromEntries(
            agents.map(a => [a.stage, { recommended_provider: a.recommended_provider, recommended_model: a.recommended_model }])
          )
          reset(buildDefaultValues(
            null,
            defaultProviders,
            reviewApproveScore,
            reviewRejectThreshold,
            reviewMaxIterations,
            brainstormDone,
            researchDone,
            agentRecs,
          ))
        }
      } catch {
        // Non-fatal — wizard still works with empty provider list
      } finally {
        if (!cancelled) setLoadingProviders(false)
      }
    }

    void load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Watch all provider + model values
  const brainstormProvider   = useWatch({ control, name: 'brainstorm.providerOverride' }) as ValidProvider | null
  const brainstormModel      = useWatch({ control, name: 'brainstorm.modelOverride' }) as string | null
  const brainstormMode       = useWatch({ control, name: 'brainstorm.brainstormMode' }) as 'topic_driven' | 'reference_guided' | undefined
  const researchProvider     = useWatch({ control, name: 'research.providerOverride' }) as ValidProvider | null
  const researchModel        = useWatch({ control, name: 'research.modelOverride' }) as string | null
  const canonicalCoreProvider = useWatch({ control, name: 'canonicalCore.providerOverride' }) as ValidProvider | null
  const canonicalCoreModel   = useWatch({ control, name: 'canonicalCore.modelOverride' }) as string | null
  const draftProvider        = useWatch({ control, name: 'draft.providerOverride' }) as ValidProvider | null
  const draftModel           = useWatch({ control, name: 'draft.modelOverride' }) as string | null
  const reviewProvider       = useWatch({ control, name: 'review.providerOverride' }) as ValidProvider | null
  const reviewModel          = useWatch({ control, name: 'review.modelOverride' }) as string | null
  const assetsProvider       = useWatch({ control, name: 'assets.providerOverride' }) as ValidProvider | null
  const assetsModel          = useWatch({ control, name: 'assets.modelOverride' }) as string | null

  function onSubmit(values: FormValues) {
    const config = formValuesToAutopilotConfig(values)
    const parsed = autopilotConfigSchema.parse(config)
    actor.send({ type: 'GO_AUTOPILOT', mode: values.mode, autopilotConfig: parsed })
    onClose()
  }

  const hardFailError =
    errors.review?.hardFailThreshold?.message ??
    (errors.review as { root?: { message?: string } } | undefined)?.root?.message

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Switch to Autopilot</DialogTitle>
        </DialogHeader>

        {loadingProviders && (
          <p className="text-xs text-muted-foreground pb-1">Loading AI settings…</p>
        )}

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
                <Label>AI</Label>
                <ProviderModelPicker
                  testId="brainstorm-provider-select"
                  providerValue={brainstormProvider}
                  modelValue={brainstormModel}
                  onProviderChange={(v) => setValue('brainstorm.providerOverride', v)}
                  onModelChange={(v) => setValue('brainstorm.modelOverride', v)}
                  providers={activeProviders}
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
                {brainstormMode === 'topic_driven' && (
                  <>
                    <Label htmlFor="brainstorm-topic">Topic</Label>
                    <input
                      id="brainstorm-topic"
                      type="text"
                      data-testid="brainstorm-topic-input"
                      {...register('brainstorm.topic')}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {errors.brainstorm?.topic?.message && (
                      <p role="alert" className="text-xs text-destructive">
                        {errors.brainstorm.topic.message}
                      </p>
                    )}
                  </>
                )}
                {brainstormMode === 'reference_guided' && (
                  <>
                    <Label htmlFor="brainstorm-reference-url">Reference URL</Label>
                    <input
                      id="brainstorm-reference-url"
                      type="url"
                      data-testid="brainstorm-reference-url-input"
                      {...register('brainstorm.referenceUrl')}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {errors.brainstorm?.referenceUrl?.message && (
                      <p role="alert" className="text-xs text-destructive">
                        {errors.brainstorm.referenceUrl.message}
                      </p>
                    )}
                  </>
                )}
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
                <Label>AI</Label>
                <ProviderModelPicker
                  testId="research-provider-select"
                  providerValue={researchProvider}
                  modelValue={researchModel}
                  onProviderChange={(v) => setValue('research.providerOverride', v)}
                  onModelChange={(v) => setValue('research.modelOverride', v)}
                  providers={activeProviders}
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
            <Label>AI</Label>
            <ProviderModelPicker
              testId="canonical-core-provider-select"
              providerValue={canonicalCoreProvider}
              modelValue={canonicalCoreModel}
              onProviderChange={(v) => setValue('canonicalCore.providerOverride', v)}
              onModelChange={(v) => setValue('canonicalCore.modelOverride', v)}
              providers={activeProviders}
            />
          </section>

          {/* ── Draft slot ─────────────────────────────────── */}
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">Draft</h3>
            <Label>AI</Label>
            <ProviderModelPicker
              testId="draft-provider-select"
              providerValue={draftProvider}
              modelValue={draftModel}
              onProviderChange={(v) => setValue('draft.providerOverride', v)}
              onModelChange={(v) => setValue('draft.modelOverride', v)}
              providers={activeProviders}
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
            <Label>AI</Label>
            <ProviderModelPicker
              testId="review-provider-select"
              providerValue={reviewProvider}
              modelValue={reviewModel}
              onProviderChange={(v) => setValue('review.providerOverride', v)}
              onModelChange={(v) => setValue('review.modelOverride', v)}
              providers={activeProviders}
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
            <Label>AI</Label>
            <ProviderModelPicker
              testId="assets-provider-select"
              providerValue={assetsProvider}
              modelValue={assetsModel}
              onProviderChange={(v) => setValue('assets.providerOverride', v)}
              onModelChange={(v) => setValue('assets.modelOverride', v)}
              providers={activeProviders}
            />
            <Label>Mode</Label>
            <Controller
              control={control}
              name="assets.assetMode"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} className="mt-1">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="skip" id="mini-assets-skip" />
                    <Label htmlFor="mini-assets-skip" className="text-sm font-normal">Skip — go straight to preview (no images)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="auto_generate" id="mini-assets-auto" />
                    <Label htmlFor="mini-assets-auto" className="text-sm font-normal">Auto-generate — AI generates images, no manual review</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="briefs_only" id="mini-assets-briefs" />
                    <Label htmlFor="mini-assets-briefs" className="text-sm font-normal">Briefs only — AI generates briefs, you finish in the engine</Label>
                  </div>
                </RadioGroup>
              )}
            />
          </section>

          {/* ── Preview slot ───────────────────────────────── */}
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">Preview</h3>
            <Label htmlFor="mini-preview-enabled" className="flex items-center gap-3">
              <Controller
                control={control}
                name="preview.enabled"
                render={({ field }) => (
                  <Switch id="mini-preview-enabled" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
              <span className="text-sm">Preview before publish</span>
            </Label>
            <p className="text-xs text-muted-foreground mt-1 ml-12">
              When off, categories and tags are auto-applied from the AI&apos;s analysis.
            </p>
          </section>

          {/* ── Publish slot ───────────────────────────────── */}
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">Publish status</h3>
            <Controller
              control={control}
              name="publish.status"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} className="mt-1">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="draft" id="mini-publish-draft" />
                    <Label htmlFor="mini-publish-draft" className="text-sm font-normal">Draft — review on WordPress before going live</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="published" id="mini-publish-published" />
                    <Label htmlFor="mini-publish-published" className="text-sm font-normal">Published — go live immediately</Label>
                  </div>
                </RadioGroup>
              )}
            />
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Activate Autopilot</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
