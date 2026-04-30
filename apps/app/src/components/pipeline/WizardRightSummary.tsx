'use client'

import { useFormContext, useWatch } from 'react-hook-form'
import {
  Lightbulb,
  Search,
  Pen,
  Star,
  Image as ImageIcon,
  Eye,
  Send,
  BookOpen,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AutopilotConfig } from '@brighttale/shared'

interface WizardFormValues {
  mode: 'step-by-step' | 'supervised' | 'overview'
  templateId: string | null
  autopilotConfig: AutopilotConfig
}

interface ValidationError {
  stage: string
  label: string
  onFocus: () => void
}

interface WizardRightSummaryProps {
  validationErrors?: ValidationError[]
}

const MODE_LABELS: Record<string, string> = {
  'step-by-step': 'Step-by-step',
  supervised: 'Supervised',
  overview: 'Overview',
}

function SummaryRow({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className="text-sm font-medium leading-snug truncate">{value}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  )
}

export function WizardRightSummary({ validationErrors = [] }: WizardRightSummaryProps) {
  const { control } = useFormContext<WizardFormValues>()

  const mode = useWatch({ control, name: 'mode' })
  const brainstormMode = useWatch({ control, name: 'autopilotConfig.brainstorm.mode' }) as string | undefined
  const brainstormTopic = useWatch({ control, name: 'autopilotConfig.brainstorm.topic' }) as string | undefined
  const researchDepth = useWatch({ control, name: 'autopilotConfig.research.depth' }) as string | undefined
  const draftFormat = useWatch({ control, name: 'autopilotConfig.draft.format' }) as string | undefined
  const draftWordCount = useWatch({ control, name: 'autopilotConfig.draft.wordCount' }) as number | undefined
  const reviewMaxIterations = useWatch({ control, name: 'autopilotConfig.review.maxIterations' }) as number | undefined
  const reviewAutoApprove = useWatch({ control, name: 'autopilotConfig.review.autoApproveThreshold' }) as number | undefined
  const assetsMode = useWatch({ control, name: 'autopilotConfig.assets.mode' }) as string | undefined
  const previewEnabled = useWatch({ control, name: 'autopilotConfig.preview.enabled' }) as boolean | undefined
  const publishStatus = useWatch({ control, name: 'autopilotConfig.publish.status' }) as string | undefined

  const brainstormValue = brainstormTopic
    ? brainstormTopic
    : brainstormMode === 'reference_guided'
      ? 'Reference guided'
      : 'Topic driven'

  const assetsLabel: Record<string, string> = {
    skip: 'Skip (no images)',
    auto_generate: 'Auto-generate',
    briefs_only: 'Briefs only',
  }

  const modeLabel = MODE_LABELS[mode] ?? mode

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b">
        <h2 className="text-sm font-semibold">Pipeline preview</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Live summary of your configuration
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-2 divide-y divide-border">
        <SummaryRow
          icon={<Lightbulb className="h-3.5 w-3.5" />}
          label="Brainstorm"
          value={brainstormValue || 'Not set'}
          sub={brainstormMode === 'reference_guided' ? 'Reference guided' : 'Topic driven'}
        />
        <SummaryRow
          icon={<Search className="h-3.5 w-3.5" />}
          label="Research"
          value={researchDepth ? researchDepth.charAt(0).toUpperCase() + researchDepth.slice(1) : 'Medium'}
          sub="Depth"
        />
        <SummaryRow
          icon={<BookOpen className="h-3.5 w-3.5" />}
          label="Canonical Core"
          value="Persona: Auto-select"
        />
        <SummaryRow
          icon={<Pen className="h-3.5 w-3.5" />}
          label="Draft"
          value={
            draftFormat
              ? `${draftFormat.charAt(0).toUpperCase() + draftFormat.slice(1)} · ${draftWordCount ?? 1500} words`
              : 'Blog · 1500 words'
          }
        />
        <SummaryRow
          icon={<Star className="h-3.5 w-3.5" />}
          label="Review"
          value={`Up to ${reviewMaxIterations ?? 5} iterations`}
          sub={`Auto-approve at ${reviewAutoApprove ?? 90}`}
        />
        <SummaryRow
          icon={<ImageIcon className="h-3.5 w-3.5" />}
          label="Assets"
          value={assetsLabel[assetsMode ?? 'briefs_only'] ?? 'Briefs only'}
        />
        <SummaryRow
          icon={<Eye className="h-3.5 w-3.5" />}
          label="Preview"
          value={previewEnabled ? 'Preview before publish' : 'Skip preview'}
        />
        <SummaryRow
          icon={<Send className="h-3.5 w-3.5" />}
          label="Publish"
          value={publishStatus === 'published' ? 'Go live immediately' : 'Save as draft'}
        />
      </div>

      <div className="px-5 py-3 border-t">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Mode:</span>
          <Badge variant="outline" className="text-xs font-medium">
            {modeLabel}
          </Badge>
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div className="px-5 py-3 border-t bg-destructive/5">
          <p className="text-xs font-medium text-destructive mb-1.5">Required fields missing</p>
          <ul className="space-y-1">
            {validationErrors.map((err) => (
              <li key={err.stage}>
                <button
                  type="button"
                  onClick={err.onFocus}
                  className={cn(
                    'text-xs text-destructive underline-offset-2 hover:underline',
                  )}
                >
                  {err.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
