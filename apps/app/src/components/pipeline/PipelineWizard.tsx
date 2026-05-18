'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useForm, Controller, FormProvider, useFormContext } from 'react-hook-form'
import type { Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Lightbulb,
  Search,
  Pen,
  Star,
  Image as ImageIcon,
  Eye,
  Send,
  BookOpen,
  ChevronRight,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { MODELS_BY_PROVIDER, type ProviderId } from '@/components/ai/ModelPicker'
import type { AutopilotConfig } from '@brighttale/shared'
import { autopilotConfigSchema } from '@brighttale/shared'
import { MEDIA } from '@brighttale/shared/pipeline/inputs'
import type { Medium } from '@brighttale/shared/pipeline/inputs'
import { WizardModeCards } from './WizardModeCards'
import { WizardSectionCard } from './WizardSectionCard'
import { WizardRightSummary } from './WizardRightSummary'
import { CostPreviewSlot } from './CostPreviewSlot'
import { cn } from '@/lib/utils'

// ─── Form schema ─────────────────────────────────────────────────────────────

const wizardFormSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  channelId: z.string().min(1, 'Pick a channel'),
  media: z.array(z.enum(['blog', 'video', 'shorts', 'podcast'] as const)).min(1, 'Pick at least one medium'),
  mode: z.enum(['step-by-step', 'supervised', 'overview']),
  templateId: z.string().nullable(),
  autopilotConfig: z.unknown(),
  mediaConfig: z.record(z.string(), z.object({
    wordCount: z.number().int().min(100).max(20000).optional(),
    providerOverride: z.string().nullable().optional(),
    modelOverride: z.string().nullable().optional(),
  })).optional(),
}).superRefine((data, ctx) => {
  if (data.mode === 'step-by-step') return
  const result = autopilotConfigSchema.safeParse(data.autopilotConfig)
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({ ...issue, path: ['autopilotConfig', ...issue.path] })
    }
  }
})

type WizardFormValues = {
  title: string
  channelId: string
  media: Medium[]
  mode: 'step-by-step' | 'supervised' | 'overview'
  templateId: string | null
  autopilotConfig: AutopilotConfig
  mediaConfig?: Record<string, { wordCount?: number; providerOverride?: string | null; modelOverride?: string | null }>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AI_PROVIDERS = ['recommended', 'openai', 'anthropic', 'gemini', 'ollama'] as const

const STAGE_ORDER = [
  'brainstorm',
  'research',
  'canonicalCore',
  'draft',
  'review',
  'assets',
  'preview',
  'publish',
] as const

type WizardStage = (typeof STAGE_ORDER)[number]

const STAGE_LABELS: Record<WizardStage, string> = {
  brainstorm: 'Brainstorm',
  research: 'Research',
  canonicalCore: 'Canonical Core',
  draft: 'Draft',
  review: 'Review',
  assets: 'Assets',
  preview: 'Preview',
  publish: 'Publish',
}

const STAGE_ICONS: Record<WizardStage, React.ReactNode> = {
  brainstorm: <Lightbulb className="h-3.5 w-3.5" />,
  research: <Search className="h-3.5 w-3.5" />,
  canonicalCore: <BookOpen className="h-3.5 w-3.5" />,
  draft: <Pen className="h-3.5 w-3.5" />,
  review: <Star className="h-3.5 w-3.5" />,
  assets: <ImageIcon className="h-3.5 w-3.5" />,
  preview: <Eye className="h-3.5 w-3.5" />,
  publish: <Send className="h-3.5 w-3.5" />,
}

const MEDIUM_LABELS: Record<Medium, string> = {
  blog: 'Blog post',
  video: 'Long-form video',
  shorts: 'Shorts / Reels',
  podcast: 'Podcast episode',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeProviderModel(
  provider: string | null | undefined,
  model: string | null | undefined,
): string | null {
  if (!provider || !model) return model ?? null
  const validIds = (MODELS_BY_PROVIDER[provider as ProviderId] ?? []).map((m) => m.id)
  return validIds.includes(model) ? model : null
}

function buildDefaultAutopilotConfig(): AutopilotConfig {
  return {
    defaultProvider: 'recommended',
    brainstorm: {
      providerOverride: null,
      modelOverride: null,
      mode: 'topic_driven',
      topic: '',
      referenceUrl: null,
    },
    research: {
      providerOverride: null,
      modelOverride: null,
      depth: 'medium',
    },
    canonicalCore: {
      providerOverride: null,
      modelOverride: null,
      personaId: null,
    },
    draft: {
      providerOverride: null,
      modelOverride: null,
      format: 'blog',
      wordCount: 1500,
    },
    review: {
      providerOverride: null,
      modelOverride: null,
      maxIterations: 5,
      autoApproveThreshold: 90,
      hardFailThreshold: 60,
    },
    assets: {
      providerOverride: null,
      modelOverride: null,
      mode: 'briefs_only',
    },
    preview: {
      enabled: true,
    },
    publish: {
      status: 'draft',
    },
  }
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

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

// ─── Overwrite confirm dialog ─────────────────────────────────────────────────

interface OverwriteConfirmDialogProps {
  onConfirm: () => void
  onCancel: () => void
}

function OverwriteConfirmDialog({ onConfirm, onCancel }: OverwriteConfirmDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div
      role="dialog"
      aria-label="Confirm overwrite settings"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div className="bg-background rounded-lg p-6 shadow-xl w-80 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold text-lg">Apply channel defaults?</h2>
        <p className="text-sm text-muted-foreground">
          This will overwrite your current autopilot settings with the channel&apos;s defaults.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Keep mine
          </Button>
          <Button size="sm" onClick={onConfirm}>
            Apply defaults
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Field groups ─────────────────────────────────────────────────────────────

type ProviderModelStage =
  | 'brainstorm'
  | 'research'
  | 'canonicalCore'
  | 'draft'
  | 'review'
  | 'assets'

function ProviderModelFields({ stage }: { stage: ProviderModelStage }) {
  const { control, watch, setValue } = useFormContext<WizardFormValues>()
  const providerPath = `autopilotConfig.${stage}.providerOverride` as const
  const modelPath = `autopilotConfig.${stage}.modelOverride` as const
  const selectedProvider = watch(providerPath) as string | null | undefined
  const selectedModel = watch(modelPath) as string | null | undefined

  const modelOptions =
    selectedProvider && selectedProvider in MODELS_BY_PROVIDER
      ? MODELS_BY_PROVIDER[selectedProvider as ProviderId].map((m) => m.id)
      : []

  return (
    <div className="grid grid-cols-2 gap-3 pt-2 border-t mt-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Provider</Label>
        <Controller
          control={control}
          name={providerPath}
          render={({ field }) => (
            <Select
              value={field.value ?? '__recommended__'}
              onValueChange={(v) => {
                field.onChange(v === '__recommended__' ? null : v)
                setValue(modelPath, null)
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__recommended__">Recommended</SelectItem>
                {(['openai', 'anthropic', 'gemini', 'ollama'] as const).map((p) => (
                  <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Model</Label>
        <Controller
          control={control}
          name={modelPath}
          render={({ field }) => (
            <Select
              value={field.value ?? '__default__'}
              disabled={!selectedProvider || selectedProvider === '__recommended__'}
              onValueChange={(v) => field.onChange(v === '__default__' ? null : v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Provider default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">Provider default</SelectItem>
                {modelOptions.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      {selectedProvider && selectedProvider !== '__recommended__' && selectedModel && (
        <p className="col-span-2 text-[10px] text-muted-foreground">
          {selectedProvider} / {selectedModel}
        </p>
      )}
    </div>
  )
}

function BrainstormFields({ brainstormMode }: { brainstormMode: 'topic_driven' | 'reference_guided' }) {
  const { register, control, formState: { errors } } = useFormContext<WizardFormValues>()

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Mode</Label>
        <Controller
          control={control}
          name="autopilotConfig.brainstorm.mode"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
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
          <Label htmlFor="brainstorm-topic" className="text-xs font-medium text-muted-foreground mb-1.5 block">Topic</Label>
          <input
            id="brainstorm-topic"
            type="text"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
          <Label htmlFor="brainstorm-referenceUrl" className="text-xs font-medium text-muted-foreground mb-1.5 block">Reference URL</Label>
          <input
            id="brainstorm-referenceUrl"
            type="url"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Reference URL"
            {...register('autopilotConfig.brainstorm.referenceUrl')}
          />
        </div>
      )}

      <div>
        <Label htmlFor="brainstorm-niche" className="text-xs font-medium text-muted-foreground mb-1.5 block">Niche</Label>
        <input
          id="brainstorm-niche"
          type="text"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          {...register('autopilotConfig.brainstorm.niche')}
        />
      </div>
      <ProviderModelFields stage="brainstorm" />
    </div>
  )
}

function ResearchFields() {
  const { control } = useFormContext<WizardFormValues>()

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Research depth</Label>
        <Controller
          control={control}
          name="autopilotConfig.research.depth"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
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
      <ProviderModelFields stage="research" />
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
    <div className="space-y-3">
      <div>
        <Label htmlFor="canonicalCore-personaId" className="text-xs font-medium text-muted-foreground mb-1.5 block">Persona (optional)</Label>
        <Controller
          control={control}
          name="autopilotConfig.canonicalCore.personaId"
          render={({ field }) => (
            <Select
              value={field.value ?? '__auto__'}
              onValueChange={(v) => field.onChange(v === '__auto__' ? null : v)}
              disabled={loading}
            >
              <SelectTrigger id="canonicalCore-personaId" className="w-full">
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
      <ProviderModelFields stage="canonicalCore" />
    </div>
  )
}

function DraftFields() {
  const { register, control, formState: { errors } } = useFormContext<WizardFormValues>()

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Format</Label>
        <Controller
          control={control}
          name="autopilotConfig.draft.format"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
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
        <Label htmlFor="draft-wordCount" className="text-xs font-medium text-muted-foreground mb-1.5 block">Word count (blog)</Label>
        <input
          id="draft-wordCount"
          type="number"
          className="flex h-9 w-32 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          {...register('autopilotConfig.draft.wordCount', { valueAsNumber: true })}
        />
        {errors.autopilotConfig?.draft?.wordCount && (
          <p className="text-xs text-destructive mt-1">
            {errors.autopilotConfig.draft.wordCount.message}
          </p>
        )}
      </div>
      <ProviderModelFields stage="draft" />
    </div>
  )
}

function ReviewFields() {
  const { register, formState: { errors } } = useFormContext<WizardFormValues>()

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="review-maxIterations" className="text-xs font-medium text-muted-foreground mb-1.5 block">Max iterations</Label>
        <input
          id="review-maxIterations"
          type="number"
          className="flex h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          {...register('autopilotConfig.review.maxIterations', { valueAsNumber: true })}
        />
      </div>
      <div>
        <Label htmlFor="review-autoApproveThreshold" className="text-xs font-medium text-muted-foreground mb-1.5 block">Auto-approve threshold</Label>
        <input
          id="review-autoApproveThreshold"
          type="number"
          className="flex h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          {...register('autopilotConfig.review.autoApproveThreshold', { valueAsNumber: true })}
        />
      </div>
      <div>
        <Label htmlFor="review-hardFailThreshold" className="text-xs font-medium text-muted-foreground mb-1.5 block">Hard-fail threshold</Label>
        <input
          id="review-hardFailThreshold"
          type="number"
          className="flex h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          {...register('autopilotConfig.review.hardFailThreshold', { valueAsNumber: true })}
        />
        {errors.autopilotConfig?.review?.hardFailThreshold && (
          <p className="text-xs text-destructive mt-1">
            {errors.autopilotConfig.review.hardFailThreshold.message}
          </p>
        )}
      </div>
      <ProviderModelFields stage="review" />
    </div>
  )
}

function AssetsFields() {
  const { control } = useFormContext<WizardFormValues>()

  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground mb-2 block">Assets mode</Label>
      <Controller
        control={control}
        name="autopilotConfig.assets.mode"
        render={({ field }) => (
          <RadioGroup value={field.value} onValueChange={field.onChange} className="space-y-2">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="skip" id="assets-skip" />
              <Label htmlFor="assets-skip" className="text-sm font-normal cursor-pointer">Skip — go straight to preview (no images)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="auto_generate" id="assets-auto" />
              <Label htmlFor="assets-auto" className="text-sm font-normal cursor-pointer">Auto-generate — AI generates images, no manual review</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="briefs_only" id="assets-briefs" />
              <Label htmlFor="assets-briefs" className="text-sm font-normal cursor-pointer">Briefs only — AI generates briefs, you finish in the engine</Label>
            </div>
          </RadioGroup>
        )}
      />
      <ProviderModelFields stage="assets" />
    </div>
  )
}

function PreviewFields() {
  const { control } = useFormContext<WizardFormValues>()

  return (
    <div>
      <Label htmlFor="preview-enabled" className="flex items-center gap-3 cursor-pointer">
        <Controller
          control={control}
          name="autopilotConfig.preview.enabled"
          render={({ field }) => (
            <Switch id="preview-enabled" checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
        <span className="text-sm">Preview before publish</span>
      </Label>
      <p className="text-xs text-muted-foreground mt-1.5 ml-12">
        When off, categories and tags are auto-applied from the AI&apos;s analysis.
      </p>
    </div>
  )
}

function PublishFields() {
  const { control } = useFormContext<WizardFormValues>()

  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground mb-2 block">Publish status</Label>
      <Controller
        control={control}
        name="autopilotConfig.publish.status"
        render={({ field }) => (
          <RadioGroup value={field.value} onValueChange={field.onChange} className="space-y-2">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="draft" id="publish-draft" />
              <Label htmlFor="publish-draft" className="text-sm font-normal cursor-pointer">Draft — review on WordPress before going live</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="published" id="publish-published" />
              <Label htmlFor="publish-published" className="text-sm font-normal cursor-pointer">Published — go live immediately</Label>
            </div>
          </RadioGroup>
        )}
      />
    </div>
  )
}

// ─── Section summary helpers ──────────────────────────────────────────────────

function getStageSummary(stage: WizardStage, values: WizardFormValues): string {
  const cfg = values.autopilotConfig
  if (!cfg) return ''
  switch (stage) {
    case 'brainstorm': {
      const b = cfg.brainstorm
      if (!b) return ''
      return b.topic ? `Topic: ${b.topic}` : b.mode === 'reference_guided' ? 'Reference guided' : 'Topic driven'
    }
    case 'research': {
      const r = cfg.research
      if (!r) return ''
      return `Depth: ${r.depth}`
    }
    case 'canonicalCore':
      return cfg.canonicalCore?.personaId ? `Persona: ${cfg.canonicalCore.personaId}` : 'Auto-select'
    case 'draft':
      if (!cfg.draft) return ''
      return `${cfg.draft.format} · ${cfg.draft.wordCount} words`
    case 'review':
      if (!cfg.review) return ''
      return `${cfg.review.maxIterations} iterations · threshold ${cfg.review.autoApproveThreshold}`
    case 'assets': {
      if (!cfg.assets) return ''
      const map: Record<string, string> = { skip: 'Skip', auto_generate: 'Auto-generate', briefs_only: 'Briefs only' }
      return map[cfg.assets.mode] ?? cfg.assets.mode
    }
    case 'preview':
      if (!cfg.preview) return ''
      return cfg.preview.enabled ? 'Enabled' : 'Disabled'
    case 'publish':
      if (!cfg.publish) return ''
      return cfg.publish.status === 'published' ? 'Published' : 'Draft'
    default:
      return ''
  }
}

// ─── Mobile summary sheet ─────────────────────────────────────────────────────

interface MobileSummarySheetProps {
  open: boolean
  onClose: () => void
}

function MobileSummarySheet({ open, onClose }: MobileSummarySheetProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end md:hidden"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative z-50 flex flex-col bg-background rounded-t-xl max-h-[70vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <span className="font-semibold text-sm">Pipeline preview</span>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          <WizardRightSummary />
        </div>
      </div>
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = { id: string; name: string }

interface TemplateRow {
  id: string
  name: string
  config_json: AutopilotConfig
  is_default: boolean
}

interface ChannelMergeData {
  mediaConfig: Record<string, Record<string, unknown>> | null
  defaultTemplate: TemplateRow | null
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialChannelId?: string | null
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PipelineWizard({ initialChannelId }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const baseConfig = buildDefaultAutopilotConfig()

  const defaultValues: WizardFormValues = {
    title: '',
    channelId: '',
    media: ['blog'],
    mode: 'step-by-step',
    templateId: null,
    autopilotConfig: baseConfig,
    mediaConfig: {},
  }

  const methods = useForm<WizardFormValues>({
    resolver: zodResolver(wizardFormSchema) as Resolver<WizardFormValues>,
    defaultValues,
  })

  const { handleSubmit, control, watch, formState: { errors, isDirty }, getValues, setValue } = methods

  const mode = watch('mode')
  const watchedValues = watch()
  const watchedTitle = watch('title')
  const watchedChannelId = watch('channelId')
  const selectedMedia = watch('media')
  const brainstormMode = watch('autopilotConfig.brainstorm.mode') ?? 'topic_driven'
  const watchedBrainstormTopic = watch('autopilotConfig.brainstorm.topic') ?? ''
  const watchedWordCount = watch('autopilotConfig.draft.wordCount') ?? 1500

  const isAutopilot = mode === 'supervised' || mode === 'overview'

  const canSubmit =
    watchedTitle.trim().length >= 3 &&
    watchedChannelId.length > 0 &&
    selectedMedia.length > 0 &&
    (!isAutopilot ||
      brainstormMode !== 'topic_driven' ||
      watchedBrainstormTopic.trim().length > 0)

  const [channels, setChannels] = useState<Channel[] | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Template state
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loadedTemplateId, setLoadedTemplateId] = useState<string | null>(null)
  const [loadedTemplateName, setLoadedTemplateName] = useState<string | null>(null)
  const [templateActionError, setTemplateActionError] = useState<string | null>(null)

  // Dialog state
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false)
  const [showMobileSummary, setShowMobileSummary] = useState(false)
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false)
  const pendingChannelMerge = useRef<ChannelMergeData | null>(null)

  const sectionRefs = useRef<Partial<Record<WizardStage, HTMLDivElement | null>>>({})

  // ── Fetch channels on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const ac = new AbortController()
    ;(async () => {
      try {
        const res = await fetch('/api/channels', { signal: ac.signal })
        const json = await res.json()
        const list = (json?.data?.items ?? json?.data?.channels ?? []) as Channel[]
        setChannels(list)
        // Apply initialChannelId or single-channel preselect
        if (initialChannelId && list.some((c) => c.id === initialChannelId)) {
          setValue('channelId', initialChannelId, { shouldValidate: false })
        } else if (!initialChannelId && list.length === 1) {
          setValue('channelId', list[0].id, { shouldValidate: false })
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setChannels([])
      }
    })()
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Template refresh ─────────────────────────────────────────────────────────
  const refreshTemplates = async (channelId: string | null) => {
    try {
      const channelUrl = channelId
        ? `/api/autopilot-templates?channelId=${encodeURIComponent(channelId)}`
        : '/api/autopilot-templates'
      const globalUrl = '/api/autopilot-templates?channelId=null'
      const [channelRes, globalRes] = await Promise.all([
        fetch(channelUrl),
        fetch(globalUrl),
      ])
      const channelJson = (await channelRes.json()) as { data: { items: TemplateRow[] } | null; error: unknown }
      const globalJson = (await globalRes.json()) as { data: { items: TemplateRow[] } | null; error: unknown }
      const channelItems = channelJson.data?.items ?? []
      const globalItems = globalJson.data?.items ?? []
      // Deduplicate by id
      const seen = new Set<string>()
      const merged: TemplateRow[] = []
      for (const t of [...channelItems, ...globalItems]) {
        if (!seen.has(t.id)) {
          seen.add(t.id)
          merged.push(t)
        }
      }
      setTemplates(merged)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setTemplateActionError(msg)
    }
  }

  // ── Channel-select merge ─────────────────────────────────────────────────────
  const applyChannelMerge = (data: ChannelMergeData) => {
    const { mediaConfig, defaultTemplate } = data
    // Start from base config
    let merged: AutopilotConfig = { ...baseConfig }
    // Apply default template if any
    if (defaultTemplate) {
      const raw = defaultTemplate.config_json as Partial<AutopilotConfig>
      merged = {
        ...merged,
        ...raw,
        preview: raw.preview ?? merged.preview,
        publish: raw.publish ?? merged.publish,
      }
    }
    // Apply channel media defaults (wordCount from mediaConfig.blog if present)
    if (mediaConfig?.blog?.wordCount && typeof mediaConfig.blog.wordCount === 'number') {
      merged = {
        ...merged,
        draft: {
          ...merged.draft,
          wordCount: mediaConfig.blog.wordCount as number,
        },
      }
    }
    // Sanitize provider/model pairs
    if (merged.brainstorm) {
      merged.brainstorm = { ...merged.brainstorm, modelOverride: sanitizeProviderModel(merged.brainstorm.providerOverride, merged.brainstorm.modelOverride) }
    }
    if (merged.research) {
      merged.research = { ...merged.research, modelOverride: sanitizeProviderModel(merged.research.providerOverride, merged.research.modelOverride) }
    }
    merged.canonicalCore = { ...merged.canonicalCore, modelOverride: sanitizeProviderModel(merged.canonicalCore.providerOverride, merged.canonicalCore.modelOverride) }
    merged.draft = { ...merged.draft, modelOverride: sanitizeProviderModel(merged.draft.providerOverride, merged.draft.modelOverride) }
    merged.review = { ...merged.review, modelOverride: sanitizeProviderModel(merged.review.providerOverride, merged.review.modelOverride) }
    merged.assets = { ...merged.assets, modelOverride: sanitizeProviderModel(merged.assets.providerOverride, merged.assets.modelOverride) }

    methods.reset({
      ...getValues(),
      autopilotConfig: merged,
      templateId: defaultTemplate?.id ?? null,
    })
    if (defaultTemplate) {
      setLoadedTemplateId(defaultTemplate.id)
      setLoadedTemplateName(defaultTemplate.name)
    }
  }

  const handleChannelSelect = async (channelId: string) => {
    setValue('channelId', channelId, { shouldValidate: true })
    // Parallel fetch channel defaults + templates + personas
    await refreshTemplates(channelId)
    try {
      const [mediaConfigRes, templateRes, personasRes] = await Promise.allSettled([
        fetch(`/api/channels/${channelId}/default-media-config`),
        fetch(`/api/autopilot-templates?channelId=${encodeURIComponent(channelId)}`),
        fetch(`/api/channels/${channelId}/personas`),
      ])

      let mediaConfig: Record<string, Record<string, unknown>> | null = null
      if (mediaConfigRes.status === 'fulfilled' && mediaConfigRes.value.ok) {
        try {
          const json = await mediaConfigRes.value.json()
          mediaConfig = json?.data?.default_media_config_json ?? null
        } catch {
          console.warn('[PipelineWizard] Failed to parse channel media config')
        }
      }

      let defaultTemplate: TemplateRow | null = null
      if (templateRes.status === 'fulfilled' && templateRes.value.ok) {
        try {
          const json = (await templateRes.value.json()) as { data: { items: TemplateRow[] } | null }
          const items = json.data?.items ?? []
          defaultTemplate = items.find((t) => t.is_default) ?? null
        } catch {
          console.warn('[PipelineWizard] Failed to parse templates response')
        }
      }

      if (personasRes.status === 'rejected' || (personasRes.status === 'fulfilled' && !personasRes.value.ok)) {
        console.warn('[PipelineWizard] Failed to fetch channel personas')
      }

      const mergeData: ChannelMergeData = { mediaConfig, defaultTemplate }

      // If autopilot fields are dirty, confirm overwrite
      if (isDirty && isAutopilot) {
        pendingChannelMerge.current = mergeData
        setShowOverwriteConfirm(true)
      } else {
        applyChannelMerge(mergeData)
      }
    } catch (err) {
      console.warn('[PipelineWizard] Channel merge failed:', err instanceof Error ? err.message : err)
    }
  }

  const handleOverwriteConfirm = () => {
    setShowOverwriteConfirm(false)
    if (pendingChannelMerge.current) {
      applyChannelMerge(pendingChannelMerge.current)
      pendingChannelMerge.current = null
    }
  }

  const handleOverwriteCancel = () => {
    setShowOverwriteConfirm(false)
    pendingChannelMerge.current = null
  }

  // ── Template handling ────────────────────────────────────────────────────────
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
    const raw = template.config_json as Partial<AutopilotConfig>
    const merged: AutopilotConfig = {
      ...baseConfig,
      ...raw,
      preview: raw.preview ?? baseConfig.preview,
      publish: raw.publish ?? baseConfig.publish,
    }
    if (merged.brainstorm) {
      merged.brainstorm = { ...merged.brainstorm, modelOverride: sanitizeProviderModel(merged.brainstorm.providerOverride, merged.brainstorm.modelOverride) }
    }
    if (merged.research) {
      merged.research = { ...merged.research, modelOverride: sanitizeProviderModel(merged.research.providerOverride, merged.research.modelOverride) }
    }
    merged.canonicalCore = { ...merged.canonicalCore, modelOverride: sanitizeProviderModel(merged.canonicalCore.providerOverride, merged.canonicalCore.modelOverride) }
    merged.draft = { ...merged.draft, modelOverride: sanitizeProviderModel(merged.draft.providerOverride, merged.draft.modelOverride) }
    merged.review = { ...merged.review, modelOverride: sanitizeProviderModel(merged.review.providerOverride, merged.review.modelOverride) }
    merged.assets = { ...merged.assets, modelOverride: sanitizeProviderModel(merged.assets.providerOverride, merged.assets.modelOverride) }
    methods.reset({
      ...getValues(),
      templateId: template.id,
      autopilotConfig: merged,
    })
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
      await refreshTemplates(getValues('channelId') || null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setTemplateActionError(msg)
    }
  }

  // ── Validation expand on submit error ────────────────────────────────────────
  const onInvalid = (validationErrors: typeof errors) => {
    const configErrors =
      (validationErrors.autopilotConfig as Record<string, unknown> | undefined) ?? {}
    let firstStageWithError: WizardStage | null = null
    for (const stage of STAGE_ORDER) {
      if (configErrors[stage]) {
        firstStageWithError = stage
        const ref = sectionRefs.current[stage]
        if (ref) {
          const trigger = ref.querySelector('button[aria-expanded]') as HTMLButtonElement | null
          if (trigger && trigger.getAttribute('aria-expanded') === 'false') {
            trigger.click()
          }
          if (typeof ref.scrollIntoView === 'function') {
            ref.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }
        break
      }
    }
    const fieldList = [
      validationErrors.title && 'title',
      validationErrors.channelId && 'channel',
      validationErrors.media && 'media',
      firstStageWithError && `${STAGE_LABELS[firstStageWithError]} settings`,
    ].filter(Boolean).join(', ')
    toast({
      title: 'Fix required fields',
      description: fieldList ? `Check: ${fieldList}` : 'Some required fields are missing.',
      variant: 'destructive',
    })
  }

  // ── Submit handler ───────────────────────────────────────────────────────────
  const onValid = async (values: WizardFormValues) => {
    setSubmitting(true)
    const isAutopilotMode = values.mode !== 'step-by-step'
    const payload = {
      title: values.title.trim(),
      channelId: values.channelId,
      current_stage: 'brainstorm' as const,
      status: 'active' as const,
      winner: false,
      mode: values.mode,
      media: values.media,
      mediaConfig: values.media.length >= 2 && isAutopilotMode ? values.mediaConfig : undefined,
      autopilotConfigJson: isAutopilotMode ? values.autopilotConfig : undefined,
    }
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || json?.error) {
        toast({ title: 'Failed to create project', description: json?.error?.message ?? 'Unknown error', variant: 'destructive' })
        setSubmitting(false)
        return
      }
      const id = json?.data?.id
      if (!id) {
        toast({ title: 'Failed to create project', variant: 'destructive' })
        setSubmitting(false)
        return
      }
      router.push(`/projects/${id}`)
    } catch (err) {
      toast({
        title: 'Failed to create project',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
      setSubmitting(false)
    }
  }

  // ── Template chips helpers ───────────────────────────────────────────────────
  const visibleTemplates = templates.slice(0, 3)
  const hasMoreTemplates = templates.length > 3

  // ── Loading state ────────────────────────────────────────────────────────────
  if (channels === null) {
    return <p className="p-6 text-sm text-muted-foreground">Loading...</p>
  }

  return (
    <FormProvider {...methods}>
      {/* Dialogs rendered outside main form */}
      {showOverwriteConfirm && (
        <OverwriteConfirmDialog
          onConfirm={handleOverwriteConfirm}
          onCancel={handleOverwriteCancel}
        />
      )}
      {showUpdateConfirm && loadedTemplateName && (
        <UpdateConfirmDialog
          templateName={loadedTemplateName}
          onConfirm={handleUpdateTemplate}
          onCancel={() => setShowUpdateConfirm(false)}
        />
      )}
      {/* SaveAsNewDialog is kept in file but not rendered — save-as-template is deferred */}

      <MobileSummarySheet open={showMobileSummary} onClose={() => setShowMobileSummary(false)} />

      <div data-testid="pipeline-wizard" className="relative flex flex-col min-h-0 h-full">
        {/* ── Main two-column layout ─────────────────────── */}
        <form
          id="pipeline-wizard-form"
          onSubmit={handleSubmit(onValid, onInvalid)}
          className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden"
        >
          {/* ── Left rail ─────────────────────────────────── */}
          <div className="flex flex-col w-full md:w-[42%] md:min-w-0 md:border-r overflow-y-auto">
            <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-6 pt-5">

              {/* ── Header card: title + channel + media ──────── */}
              <div className="space-y-5 rounded-lg border bg-background p-5">
                {/* Project title */}
                <div className="space-y-2">
                  <Label htmlFor="project-title">Project title</Label>
                  <Input
                    id="project-title"
                    placeholder="e.g. Q2 launch announcement"
                    maxLength={200}
                    {...methods.register('title')}
                    aria-invalid={!!errors.title}
                  />
                  {errors.title && (
                    <p className="text-xs text-destructive">{errors.title.message}</p>
                  )}
                </div>

                {/* Channel selection */}
                <div className="space-y-2">
                  <Label>Channel</Label>
                  {channels.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No channels found. <button type="button" className="underline" onClick={() => router.push('/channels')}>Create one</button>
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {channels.map((ch) => {
                        const selected = watch('channelId') === ch.id
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            data-testid="channel-option"
                            onClick={() => void handleChannelSelect(ch.id)}
                            className={cn(
                              'rounded-lg border px-3 py-2 text-sm transition-all duration-150 text-left',
                              'hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              selected
                                ? 'border-primary bg-primary/5 text-primary font-medium ring-1 ring-primary'
                                : 'border-border bg-background text-foreground',
                            )}
                          >
                            {ch.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {errors.channelId && (
                    <p className="text-xs text-destructive">{errors.channelId.message}</p>
                  )}
                </div>

                {/* Media selection */}
                <div className="space-y-2">
                  <Label>Media</Label>
                  <p className="text-xs text-muted-foreground">
                    Pick which output formats to generate. Each medium runs its own track.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {MEDIA.map((m) => {
                      const checked = selectedMedia.includes(m)
                      return (
                        <label
                          key={m}
                          className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-accent/30"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const current = getValues('media')
                              if (e.target.checked) {
                                setValue('media', [...current, m], { shouldValidate: true })
                              } else {
                                setValue('media', current.filter((x) => x !== m), { shouldValidate: true })
                              }
                            }}
                            aria-label={MEDIUM_LABELS[m]}
                          />
                          <span className="text-sm">{MEDIUM_LABELS[m]}</span>
                        </label>
                      )
                    })}
                  </div>
                  {errors.media && (
                    <p className="text-xs text-destructive">{errors.media.message}</p>
                  )}
                </div>
              </div>

              {/* ── Mode card ─────────────────────────────────── */}
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Pipeline mode
                </h2>
                <WizardModeCards />
              </section>

              {/* ── Autopilot sections (supervised / overview only) ── */}
              {isAutopilot && (
                <>
                  <Separator />

                  {/* Template chips */}
                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Template
                      </h2>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleLoadTemplate('none')}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs transition-all',
                          !loadedTemplateId
                            ? 'border-primary bg-primary/5 text-primary font-medium'
                            : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
                        )}
                      >
                        Blank
                      </button>
                      {visibleTemplates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleLoadTemplate(t.id)}
                          className={cn(
                            'rounded-full border px-3 py-1 text-xs transition-all',
                            loadedTemplateId === t.id
                              ? 'border-primary bg-primary/5 text-primary font-medium'
                              : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
                          )}
                        >
                          {t.name}
                          {t.is_default && ' ★'}
                        </button>
                      ))}
                      {hasMoreTemplates && (
                        <Select
                          value={loadedTemplateId ?? 'none'}
                          onValueChange={handleLoadTemplate}
                        >
                          <SelectTrigger className="h-6 rounded-full border px-3 py-1 text-xs w-auto gap-1" aria-label="Load template">
                            <SelectValue placeholder="More…" />
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
                      )}
                      {!hasMoreTemplates && templates.length > 0 && (
                        <Select
                          value={loadedTemplateId ?? 'none'}
                          onValueChange={handleLoadTemplate}
                        >
                          <SelectTrigger className="sr-only" aria-label="Load template">
                            <SelectValue />
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
                      )}
                    </div>
                    {loadedTemplateId && loadedTemplateName && (
                      <button
                        type="button"
                        onClick={() => setShowUpdateConfirm(true)}
                        className="mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Update template {loadedTemplateName}
                      </button>
                    )}
                    {templateActionError && (
                      <p
                        role="alert"
                        data-testid="template-action-error"
                        className="mt-1.5 text-xs text-destructive"
                      >
                        {templateActionError}
                      </p>
                    )}
                  </section>

                  <Separator />

                  {/* Default AI provider */}
                  <section>
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Default AI provider
                    </h2>
                    <Controller
                      control={control}
                      name="autopilotConfig.defaultProvider"
                      render={({ field }) => (
                        <Select value={field.value ?? 'recommended'} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full">
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

                  <Separator />

                  {/* Stage sections */}
                  <section className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      Stages
                    </h2>
                    {STAGE_ORDER.map((stage) => {
                      const label = STAGE_LABELS[stage]
                      const icon = STAGE_ICONS[stage]
                      const summary = getStageSummary(stage, watchedValues)

                      // Per-medium Draft tabs when multiple media selected in autopilot
                      const isDraftStageWithMultiMedia = stage === 'draft' && selectedMedia.length >= 2

                      return (
                        <WizardSectionCard
                          key={stage}
                          stage={stage}
                          label={label}
                          icon={icon}
                          defaultOpen={stage === 'brainstorm'}
                          completed={false}
                          summary={summary}
                          sectionRef={(el) => {
                            sectionRefs.current[stage] = el
                          }}
                        >
                          {stage === 'brainstorm' && (
                            <BrainstormFields brainstormMode={brainstormMode} />
                          )}
                          {stage === 'research' && <ResearchFields />}
                          {stage === 'canonicalCore' && <CanonicalCoreFields />}
                          {stage === 'draft' && !isDraftStageWithMultiMedia && <DraftFields />}
                          {isDraftStageWithMultiMedia && (
                            <MultiMediaDraftFields selectedMedia={selectedMedia} />
                          )}
                          {stage === 'review' && <ReviewFields />}
                          {stage === 'assets' && <AssetsFields />}
                          {stage === 'preview' && <PreviewFields />}
                          {stage === 'publish' && <PublishFields />}
                        </WizardSectionCard>
                      )
                    })}
                  </section>

                  {/* Cost preview */}
                  <section>
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Estimated cost
                    </h2>
                    <CostPreviewSlot
                      selectedMedia={selectedMedia}
                      wordCount={watchedWordCount}
                    />
                  </section>
                </>
              )}
            </div>
          </div>

          {/* ── Right summary (desktop) ──────────────────── */}
          <div className="hidden md:flex md:flex-col md:flex-1 md:min-w-0 overflow-hidden">
            <WizardRightSummary />
          </div>
        </form>

        {/* ── Sticky action bar ──────────────────────────── */}
        <div className="shrink-0 border-t bg-background/95 backdrop-blur-sm px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            Back to projects
          </button>

          <div className="flex-1" />

          {/* Mobile summary trigger */}
          <button
            type="button"
            onClick={() => setShowMobileSummary(true)}
            className="md:hidden text-xs text-muted-foreground border rounded-full px-3 py-1 hover:border-primary/50 transition-colors"
          >
            Preview
          </button>

          <Button
            type="button"
            onClick={handleSubmit(onValid, onInvalid)}
            disabled={submitting || !canSubmit}
          >
            {submitting ? 'Creating...' : 'Create project'}
          </Button>
        </div>
      </div>
    </FormProvider>
  )
}

// ─── Multi-media draft fields ─────────────────────────────────────────────────

function MultiMediaDraftFields({ selectedMedia }: { selectedMedia: Medium[] }) {
  const [activeTab, setActiveTab] = useState<Medium>(selectedMedia[0] ?? 'blog')
  const { register, formState: { errors } } = useFormContext<WizardFormValues>()

  // Ensure active tab is always valid
  const tab = selectedMedia.includes(activeTab) ? activeTab : selectedMedia[0] ?? 'blog'

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        {selectedMedia.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setActiveTab(m)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium capitalize border-b-2 -mb-px transition-colors',
              tab === m
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <div className="space-y-3">
        <div>
          <Label htmlFor={`mediaConfig-${tab}-wordCount`} className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Word count
          </Label>
          <input
            id={`mediaConfig-${tab}-wordCount`}
            type="number"
            className="flex h-9 w-32 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            {...register(`mediaConfig.${tab}.wordCount`, { valueAsNumber: true })}
          />
          {errors.mediaConfig?.[tab]?.wordCount && (
            <p className="text-xs text-destructive mt-1">
              {errors.mediaConfig[tab]?.wordCount?.message}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Provider override</Label>
            <input
              type="text"
              placeholder="e.g. openai"
              className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm"
              {...register(`mediaConfig.${tab}.providerOverride`)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Model override</Label>
            <input
              type="text"
              placeholder="e.g. gpt-4o"
              className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm"
              {...register(`mediaConfig.${tab}.modelOverride`)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// T5.3: CostPreviewSlot — re-exported from its own file for consumers who import from PipelineWizard
export { CostPreviewSlot } from './CostPreviewSlot'
