'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
import { ChannelPicker } from '@/components/projects/ChannelPicker'
import { MEDIA } from '@brighttale/shared/pipeline/inputs'
import type { Medium } from '@brighttale/shared/pipeline/inputs'
import type { AutopilotConfig } from '@brighttale/shared'
import { List, Eye, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'

type Channel = { id: string; name: string }
type Mode = 'step-by-step' | 'supervised' | 'overview'

const MODE_OPTIONS: Array<{
  value: Mode
  label: string
  description: string
  Icon: React.ComponentType<{ className?: string }>
}> = [
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

const MEDIUM_LABELS: Record<Medium, string> = {
  blog: 'Blog post',
  video: 'Long-form video',
  shorts: 'Shorts / Reels',
  podcast: 'Podcast episode',
}

function defaultAutopilotConfig(): AutopilotConfig {
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

interface Props {
  initialChannelId?: string | null
}

export function ProjectCreationWizard({ initialChannelId }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const [channels, setChannels] = useState<Channel[] | null>(null)
  const [channelId, setChannelId] = useState<string | null>(initialChannelId ?? null)
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<Mode>('step-by-step')
  const [media, setMedia] = useState<Medium[]>(['blog'])
  const [topic, setTopic] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/channels')
      const json = await res.json()
      const list = (json?.data?.items ?? []) as Channel[]
      setChannels(list)
      if (!channelId && list.length === 1) {
        setChannelId(list[0].id)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isAutopilot = mode === 'supervised' || mode === 'overview'
  const canSubmit = useMemo(() => {
    if (!channelId) return false
    if (title.trim().length < 3) return false
    if (media.length === 0) return false
    if (isAutopilot && topic.trim().length === 0) return false
    return true
  }, [channelId, title, media, isAutopilot, topic])

  function toggleMedium(m: Medium) {
    setMedia((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
  }

  async function handleSubmit() {
    if (!canSubmit || submitting) return
    setSubmitting(true)

    const autopilot = isAutopilot ? defaultAutopilotConfig() : null
    if (autopilot && autopilot.brainstorm) {
      autopilot.brainstorm.topic = topic.trim()
    }

    const payload = {
      title: title.trim(),
      channelId,
      current_stage: 'brainstorm' as const,
      status: 'active' as const,
      winner: false,
      mode,
      media,
      autopilotConfigJson: autopilot ?? undefined,
    }

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || json?.error) {
        toast({
          title: 'Failed to create project',
          description: json?.error?.message ?? 'Unknown error',
          variant: 'destructive',
        })
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
        description: err instanceof Error ? err.message : 'Network error',
        variant: 'destructive',
      })
      setSubmitting(false)
    }
  }

  if (channels === null) {
    return <p className="p-6 text-sm text-muted-foreground">Loading...</p>
  }

  if (channels.length === 0) {
    return (
      <div className="max-w-md mx-auto p-6">
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              You don&apos;t have any channels yet. Create one first to start a project.
            </p>
            <Button onClick={() => router.push('/channels')}>Create channel</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Start a new project</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure the pipeline before kicking off content generation.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="project-title">Project title</Label>
            <Input
              id="project-title"
              placeholder="e.g. Q2 launch announcement"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label>Channel</Label>
            <ChannelPicker channels={channels} onSelect={setChannelId} />
            {channelId && (
              <p className="text-xs text-muted-foreground">
                Selected: {channels.find((c) => c.id === channelId)?.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Pipeline mode</Label>
            <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Pipeline mode">
              {MODE_OPTIONS.map(({ value, label, description, Icon }) => {
                const selected = mode === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setMode(value)}
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
          </div>

          <div className="space-y-2">
            <Label>Media</Label>
            <p className="text-xs text-muted-foreground">
              Pick which output formats to generate. Each medium runs its own track.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {MEDIA.map((m) => (
                <label
                  key={m}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-accent/30"
                >
                  <Checkbox
                    checked={media.includes(m)}
                    onCheckedChange={() => toggleMedium(m)}
                    aria-label={MEDIUM_LABELS[m]}
                  />
                  <span className="text-sm">{MEDIUM_LABELS[m]}</span>
                </label>
              ))}
            </div>
          </div>

          {isAutopilot && (
            <div className="space-y-2">
              <Label htmlFor="brainstorm-topic">Brainstorm topic</Label>
              <Input
                id="brainstorm-topic"
                placeholder="What should the AI brainstorm about?"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Required for {mode} mode — the AI uses this as the seed.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => router.push('/projects')} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
              {submitting ? 'Creating...' : 'Create project'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
