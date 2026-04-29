'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm, Controller, FormProvider, useFormContext } from 'react-hook-form'
import type { Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePipelineActor } from '@/hooks/usePipelineActor'
import { usePipelineSettings } from '@/providers/PipelineSettingsProvider'
import type { AutopilotConfig } from '@brighttale/shared'
import { autopilotConfigSchema, setupProjectSchema } from '@brighttale/shared'
import type { StartStage } from '@brighttale/shared'
import type { StageResultMap } from '@/lib/pipeline/machine.types'

// ────────────────────────────────────────────────────────────────────
// Form schema — wizard collects mode + config; startStage is computed
// ────────────────────────────────────────────────────────────────────

const wizardFormSchema = z.object({
  mode: z.enum(['step-by-step', 'supervised', 'overview']),
  templateId: z.string().nullable(),
  autopilotConfig: autopilotConfigSchema,
})

type WizardFormValues = z.infer<typeof wizardFormSchema>

const AI_PROVIDERS = ['recommended', 'openai', 'anthropic', 'gemini', 'ollama'] as const

const STAGE_ORDER = [
  'brainstorm',
  'research',
  'canonicalCore',
  'draft',
  'review',
  'assets',
] as const

type WizardStage = (typeof STAGE_ORDER)[number]

const STAGE_LABELS: Record<WizardStage, string> = {
  brainstorm: 'Brainstorm',
  research: 'Research',
  canonicalCore: 'Canonical Core',
  draft: 'Draft',
  review: 'Review',
  assets: 'Assets',
}

function deriveStartStage(stageResults: StageResultMap): StartStage {
  const ordered: Array<keyof StageResultMap> = [
    'brainstorm',
    'research',
    'draft',
    'review',
    'assets',
    'preview',
    'publish',
  ]
  for (const stage of ordered) {
    if (!stageResults[stage]) {
      return stage as StartStage
    }
  }
  return 'brainstorm'
}

function buildDefaultAutopilotConfig(pipelineSettings: {
  reviewRejectThreshold: number
  reviewApproveScore: number
  reviewMaxIterations: number
  defaultProviders: Record<string, string>
}): AutopilotConfig {
  const dp = pipelineSettings.defaultProviders
  const toProvider = (key: string) => {
    const val = dp[key]
    if (val === 'openai' || val === 'anthropic' || val === 'gemini' || val === 'ollama') return val
    return null
  }
  return {
    defaultProvider: 'recommended',
    brainstorm: {
      providerOverride: toProvider('brainstorm'),
      mode: 'topic_driven',
      topic: '',
      referenceUrl: null,
      niche: '',
      tone: '',
      audience: '',
      goal: '',
      constraints: '',
    },
    research: {
      providerOverride: toProvider('research'),
      depth: 'medium',
    },
    canonicalCore: {
      providerOverride: toProvider('canonicalCore') ?? toProvider('draft'),
      personaId: null,
    },
    draft: {
      providerOverride: toProvider('draft'),
      format: 'blog',
      wordCount: 1500,
    },
    review: {
      providerOverride: toProvider('review'),
      maxIterations: pipelineSettings.reviewMaxIterations,
      autoApproveThreshold: pipelineSettings.reviewApproveScore,
      hardFailThreshold: pipelineSettings.reviewRejectThreshold,
    },
    assets: {
      providerOverride: toProvider('assets'),
      mode: 'briefs_only',
    },
    preview: {
      enabled: false,
    },
    publish: {
      status: 'draft',
    },
  }
}

// ────────────────────────────────────────────────────────────────────
// Dialogs
// ────────────────────────────────────────────────────────────────────

interface SaveAsNewDialogProps {
  onSave: (name: string, isDefault: boolean) => void
  onCancel: () => void
}

function SaveAsNewDialog({ onSave, onCancel }: SaveAsNewDialogProps) {
  const [name, setName] = useState('')
  const [isDefault, setIsDefault] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div
      role="dialog"
      aria-label="Save as new template"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div className="bg-background rounded-lg p-6 shadow-xl w-80 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold text-lg">Save as new template</h2>
        <div className="space-y-2">
          <Label htmlFor="template-name-input">Template name</Label>
          <input
            id="template-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm w-full"
            aria-label="Template name"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="template-default-checkbox"
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            role="checkbox"
            aria-label="Set as default"
          />
          <Label htmlFor="template-default-checkbox">Set as default</Label>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onSave(name, isDefault)} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

interface UpdateConfirmDialogProps {
  templateName: string
  onConfirm: () => void
  onCancel: () => void
}

function UpdateConfirmDialog({ templateName, onConfirm, onCancel }: UpdateConfirmDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div
      role="dialog"
      aria-label="Confirm update template"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div className="bg-background rounded-lg p-6 shadow-xl w-80 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold text-lg">Update template?</h2>
        <p className="text-sm text-muted-foreground">
          This will overwrite &ldquo;{templateName}&rdquo; with the current settings.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm}>
            Confirm
          </Button>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Sub-form field groups — use useFormContext to avoid Control<T> prop drilling
// ────────────────────────────────────────────────────────────────────

function BrainstormFields({ brainstormMode }: { brainstormMode: 'topic_driven' | 'reference_guided' }) {
  const { register, control, formState: { errors } } = useFormContext<WizardFormValues>()

  return (
    <div className="space-y-2">
      <div>
        <Controller
          control={control}
          name="autopilotConfig.brainstorm.mode"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="topic_driven">Topic driven</SelectItem>
                <SelectItem value="reference_guided">Reference guided</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {brainstormMode === 'topic_driven' && (
        <div>
          <Label htmlFor="brainstorm-topic">Topic</Label>
          <input
            id="brainstorm-topic"
            type="text"
            className="border rounded px-3 py-1.5 text-sm w-full mt-1"
            aria-label="Topic"
            {...register('autopilotConfig.brainstorm.topic')}
          />
          {errors.autopilotConfig?.brainstorm?.topic && (
            <p className="text-xs text-destructive mt-1">
              {errors.autopilotConfig.brainstorm.topic.message}
            </p>
          )}
        </div>
      )}

      {brainstormMode === 'reference_guided' && (
        <div>
          <Label htmlFor="brainstorm-referenceUrl">Reference URL</Label>
          <input
            id="brainstorm-referenceUrl"
            type="url"
            className="border rounded px-3 py-1.5 text-sm w-full mt-1"
            aria-label="Reference URL"
            {...register('autopilotConfig.brainstorm.referenceUrl')}
          />
        </div>
      )}

      <div>
        <Label htmlFor="brainstorm-niche">Niche</Label>
        <input
          id="brainstorm-niche"
          type="text"
          className="border rounded px-3 py-1.5 text-sm w-full mt-1"
          {...register('autopilotConfig.brainstorm.niche')}
        />
      </div>
    </div>
  )
}

function ResearchFields() {
  const { control } = useFormContext<WizardFormValues>()

  return (
    <div>
      <Label>Research depth</Label>
      <Controller
        control={control}
        name="autopilotConfig.research.depth"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger className="w-40 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="surface">Surface</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="deep">Deep</SelectItem>
            </SelectContent>
          </Select>
        )}
      />
    </div>
  )
}

type PersonaOption = { id: string; name: string; isActive: boolean }

function CanonicalCoreFields() {
  const { control } = useFormContext<WizardFormValues>()
  const [personas, setPersonas] = useState<PersonaOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ac = new AbortController()
    ;(async () => {
      try {
        const res = await fetch('/api/personas', { signal: ac.signal })
        const json = await res.json()
        if (json?.data) {
          setPersonas(
            (json.data as PersonaOption[]).filter((p) => p.isActive),
          )
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
      } finally {
        setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [])

  return (
    <div>
      <Label htmlFor="canonicalCore-personaId">Persona (optional)</Label>
      <Controller
        control={control}
        name="autopilotConfig.canonicalCore.personaId"
        render={({ field }) => (
          <Select
            value={field.value ?? '__auto__'}
            onValueChange={(v) => field.onChange(v === '__auto__' ? null : v)}
            disabled={loading}
          >
            <SelectTrigger id="canonicalCore-personaId" className="w-full mt-1">
              <SelectValue placeholder={loading ? 'Loading personas…' : 'Auto-select'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto__">Auto-select</SelectItem>
              {personas.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  )
}

function DraftFields() {
  const { register, control, formState: { errors } } = useFormContext<WizardFormValues>()

  return (
    <div className="space-y-2">
      <div>
        <Label>Format</Label>
        <Controller
          control={control}
          name="autopilotConfig.draft.format"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-40 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blog">Blog</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="shorts">Shorts</SelectItem>
                <SelectItem value="podcast">Podcast</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div>
        <Label htmlFor="draft-wordCount">Word count (blog)</Label>
        <input
          id="draft-wordCount"
          type="number"
          className="border rounded px-3 py-1.5 text-sm w-32 mt-1"
          {...register('autopilotConfig.draft.wordCount', { valueAsNumber: true })}
        />
        {errors.autopilotConfig?.draft?.wordCount && (
          <p className="text-xs text-destructive mt-1">
            {errors.autopilotConfig.draft.wordCount.message}
          </p>
        )}
      </div>
    </div>
  )
}

function ReviewFields() {
  const { register, formState: { errors } } = useFormContext<WizardFormValues>()

  return (
    <div className="space-y-2">
      <div>
        <Label htmlFor="review-maxIterations">Max iterations</Label>
        <input
          id="review-maxIterations"
          type="number"
          className="border rounded px-3 py-1.5 text-sm w-24 mt-1"
          {...register('autopilotConfig.review.maxIterations', { valueAsNumber: true })}
        />
      </div>
      <div>
        <Label htmlFor="review-autoApproveThreshold">Auto-approve threshold</Label>
        <input
          id="review-autoApproveThreshold"
          type="number"
          className="border rounded px-3 py-1.5 text-sm w-24 mt-1"
          {...register('autopilotConfig.review.autoApproveThreshold', { valueAsNumber: true })}
        />
      </div>
      <div>
        <Label htmlFor="review-hardFailThreshold">Hard-fail threshold</Label>
        <input
          id="review-hardFailThreshold"
          type="number"
          className="border rounded px-3 py-1.5 text-sm w-24 mt-1"
          {...register('autopilotConfig.review.hardFailThreshold', { valueAsNumber: true })}
        />
        {errors.autopilotConfig?.review?.hardFailThreshold && (
          <p className="text-xs text-destructive mt-1">
            {errors.autopilotConfig.review.hardFailThreshold.message}
          </p>
        )}
      </div>
    </div>
  )
}

function AssetsFields() {
  const { control } = useFormContext<WizardFormValues>()

  return (
    <div>
      <Label>Assets mode</Label>
      <Controller
        control={control}
        name="autopilotConfig.assets.mode"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger className="w-40 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="skip">Skip</SelectItem>
              <SelectItem value="briefs_only">Briefs Only</SelectItem>
              <SelectItem value="auto_generate">Auto Generate</SelectItem>
            </SelectContent>
          </Select>
        )}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────

export function PipelineWizard() {
  const actor = usePipelineActor()
  const { pipelineSettings } = usePipelineSettings()

  const snapshot = actor.getSnapshot()
  const { projectId, channelId, stageResults } = snapshot.context as {
    projectId: string
    channelId: string | null
    stageResults: StageResultMap
  }

  const baseConfig = buildDefaultAutopilotConfig(pipelineSettings)
  const defaultValues: WizardFormValues = {
    mode: 'step-by-step',
    templateId: null,
    autopilotConfig: {
      ...baseConfig,
      // Null out slots for already-completed stages so form validation doesn't
      // require filling in fields the user can't see (their sections are collapsed).
      brainstorm: stageResults.brainstorm ? null : baseConfig.brainstorm,
      research: stageResults.research ? null : baseConfig.research,
    },
  }

  const methods = useForm<WizardFormValues>({
    resolver: zodResolver(wizardFormSchema) as Resolver<WizardFormValues>,
    defaultValues,
  })

  const { handleSubmit, control, watch, formState: { errors }, getValues } = methods

  const mode = watch('mode')
  const brainstormMode = watch('autopilotConfig.brainstorm.mode') ?? 'topic_driven'

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  interface TemplateRow {
    id: string
    name: string
    config_json: AutopilotConfig
    is_default: boolean
  }
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loadedTemplateId, setLoadedTemplateId] = useState<string | null>(null)
  const [loadedTemplateName, setLoadedTemplateName] = useState<string | null>(null)
  const [templateActionError, setTemplateActionError] = useState<string | null>(null)

  const [showSaveAsNew, setShowSaveAsNew] = useState(false)
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false)

  const refreshTemplates = async () => {
    try {
      const url = channelId
        ? `/api/autopilot-templates?channelId=${encodeURIComponent(channelId)}`
        : '/api/autopilot-templates'
      const res = await fetch(url)
      const json = (await res.json()) as {
        data: { items: TemplateRow[] } | null
        error: { message?: string } | null
      }
      if (json.error) {
        setTemplateActionError(json.error.message ?? 'Failed to load templates')
        return
      }
      setTemplates(json.data?.items ?? [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setTemplateActionError(msg)
    }
  }

  useEffect(() => {
    void refreshTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId])

  const sectionRefs = useRef<Partial<Record<WizardStage, HTMLDetailsElement | null>>>({})

  const isStageCompleted = (stage: WizardStage): boolean => {
    const key = stage === 'canonicalCore' ? 'draft' : stage
    return Boolean(stageResults[key as keyof StageResultMap])
  }

  const onValid = async (data: WizardFormValues) => {
    setSubmitting(true)
    setSubmitError(null)

    const startStage = deriveStartStage(stageResults)
    const payload = {
      mode: data.mode,
      autopilotConfig: data.mode === 'step-by-step' ? null : data.autopilotConfig,
      templateId: data.templateId,
      startStage,
    }

    const parsed = setupProjectSchema.safeParse(payload)
    if (!parsed.success) {
      setSubmitError('Validation error: ' + parsed.error.issues.map((i) => i.message).join(', '))
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })

      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } }
        setSubmitError(json.error?.message ?? 'Request failed')
        setSubmitting(false)
        return
      }

      actor.send({
        type: 'SETUP_COMPLETE',
        mode: parsed.data.mode,
        autopilotConfig: parsed.data.autopilotConfig,
        templateId: parsed.data.templateId,
        startStage: parsed.data.startStage,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const onInvalid = () => {
    const configErrors =
      (errors.autopilotConfig as Record<string, unknown> | undefined) ?? {}
    for (const stage of STAGE_ORDER) {
      if (configErrors[stage]) {
        const ref = sectionRefs.current[stage]
        if (ref) {
          ref.open = true
          if (typeof ref.scrollIntoView === 'function') {
            ref.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }
        break
      }
    }
  }

  const handleSaveAsNew = async (name: string, isDefault: boolean) => {
    const config = getValues('autopilotConfig')
    setShowSaveAsNew(false)
    setTemplateActionError(null)
    try {
      const res = await fetch('/api/autopilot-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          channelId: channelId ?? null,
          configJson: config,
          isDefault,
        }),
      })
      const json = (await res.json()) as {
        data: TemplateRow | null
        error: { message?: string } | null
      }
      if (!res.ok || json.error) {
        setTemplateActionError(json.error?.message ?? 'Failed to save template')
        return
      }
      if (json.data) {
        setTemplates((prev) => [...prev, json.data!])
        setLoadedTemplateId(json.data.id)
        setLoadedTemplateName(json.data.name)
      }
      await refreshTemplates()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setTemplateActionError(msg)
    }
  }

  const handleUpdateTemplate = async () => {
    if (!loadedTemplateId) return
    const config = getValues('autopilotConfig')
    setShowUpdateConfirm(false)
    setTemplateActionError(null)
    try {
      const res = await fetch(`/api/autopilot-templates/${loadedTemplateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configJson: config }),
      })
      const json = (await res.json()) as {
        data: TemplateRow | null
        error: { message?: string } | null
      }
      if (!res.ok || json.error) {
        setTemplateActionError(json.error?.message ?? 'Failed to update template')
        return
      }
      await refreshTemplates()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setTemplateActionError(msg)
    }
  }

  const handleLoadTemplate = (id: string) => {
    setTemplateActionError(null)
    if (!id || id === 'none') {
      setLoadedTemplateId(null)
      setLoadedTemplateName(null)
      return
    }
    const template = templates.find((t) => t.id === id)
    if (!template) return
    setLoadedTemplateId(template.id)
    setLoadedTemplateName(template.name)
    methods.reset({
      mode: methods.getValues('mode'),
      templateId: template.id,
      autopilotConfig: template.config_json,
    })
  }

  const startStage = deriveStartStage(stageResults)

  const startStageLabel: Record<string, string> = {
    brainstorm: 'brainstorm',
    research: 'research',
    draft: 'draft',
    review: 'review',
    assets: 'assets',
    preview: 'preview',
    publish: 'publish',
  }

  const submitLabel = (() => {
    const stageName = startStageLabel[startStage] ?? startStage
    if (mode === 'supervised') return `Start ${stageName} (supervised) →`
    if (mode === 'overview') return `Start ${stageName} (overview) →`
    return `Start ${stageName} →`
  })()

  return (
    <FormProvider {...methods}>
      <div data-testid="pipeline-wizard" className="relative flex flex-col min-h-0 h-full">
        {showSaveAsNew && (
          <SaveAsNewDialog
            onSave={handleSaveAsNew}
            onCancel={() => setShowSaveAsNew(false)}
          />
        )}
        {showUpdateConfirm && loadedTemplateName && (
          <UpdateConfirmDialog
            templateName={loadedTemplateName}
            onConfirm={handleUpdateTemplate}
            onCancel={() => setShowUpdateConfirm(false)}
          />
        )}

        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3 flex-wrap">
          {channelId && (
            <Badge variant="outline" className="font-mono text-xs">
              {channelId}
            </Badge>
          )}

          <Select
            value={loadedTemplateId ?? 'none'}
            onValueChange={handleLoadTemplate}
          >
            <SelectTrigger className="w-48" aria-label="Load template">
              <SelectValue placeholder="Load template…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}{t.is_default ? ' (default)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowSaveAsNew(true)}
          >
            Save as new
          </Button>

          {loadedTemplateId && loadedTemplateName && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowUpdateConfirm(true)}
            >
              Update template {loadedTemplateName}
            </Button>
          )}

          {templateActionError && (
            <p
              role="alert"
              data-testid="template-action-error"
              className="basis-full text-xs text-destructive"
            >
              {templateActionError}
            </p>
          )}
        </div>

        {/* Form body */}
        <form
          onSubmit={handleSubmit(onValid, onInvalid)}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-6"
        >
          {/* Mode radio */}
          <section>
            <h2 className="text-sm font-semibold mb-2">Pipeline mode</h2>
            <Controller
              control={control}
              name="mode"
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="step-by-step" id="mode-step-by-step" />
                    <Label htmlFor="mode-step-by-step">Step-by-step</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="supervised" id="mode-supervised" />
                    <Label htmlFor="mode-supervised">Supervised</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="overview" id="mode-overview" />
                    <Label htmlFor="mode-overview">Overview</Label>
                  </div>
                </RadioGroup>
              )}
            />
          </section>

          {/* Default provider */}
          <section>
            <h2 className="text-sm font-semibold mb-2">Default AI provider</h2>
            <Controller
              control={control}
              name="autopilotConfig.defaultProvider"
              render={({ field }) => (
                <Select value={field.value ?? 'recommended'} onValueChange={field.onChange}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDERS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </section>

          {/* Stage sections */}
          {STAGE_ORDER.map((stage) => {
            const completed = isStageCompleted(stage)
            const label = STAGE_LABELS[stage]

            return (
              <details
                key={stage}
                ref={(el) => {
                  sectionRefs.current[stage] = el
                }}
                data-testid={`stage-section-${stage}`}
                aria-disabled={completed ? 'true' : undefined}
                open={!completed}
                className="border rounded-md p-3"
              >
                <summary className="cursor-pointer font-medium flex items-center gap-2">
                  {label}
                  {completed && (
                    <Badge variant="secondary" className="text-xs">
                      Already done
                    </Badge>
                  )}
                </summary>

                {completed ? (
                  <p className="text-sm text-muted-foreground mt-2">
                    This stage has already been completed.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {stage === 'brainstorm' && (
                      <BrainstormFields brainstormMode={brainstormMode} />
                    )}
                    {stage === 'research' && <ResearchFields />}
                    {stage === 'canonicalCore' && <CanonicalCoreFields />}
                    {stage === 'draft' && <DraftFields />}
                    {stage === 'review' && <ReviewFields />}
                    {stage === 'assets' && <AssetsFields />}
                  </div>
                )}
              </details>
            )
          })}

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          {/* Sticky footer */}
          <div className="sticky bottom-0 bg-background border-t px-4 py-3 -mx-4">
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Saving…' : submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </FormProvider>
  )
}
