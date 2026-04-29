'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, Star, StarOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { CreateAutopilotTemplateInput } from '@brighttale/shared/schemas/autopilotTemplates'

// Minimal autopilotConfig stub for new templates.
// Full config editing is intentionally deferred to the autopilot wizard (T-6.2),
// which is the proper editing surface for the nested slot configuration.
const MINIMAL_CONFIG_STUB = {
  defaultProvider: 'recommended',
  brainstorm: null,
  research: null,
  canonicalCore: { providerOverride: null, personaId: null },
  draft: { providerOverride: null, format: 'blog', wordCount: 1200 },
  review: {
    providerOverride: null,
    maxIterations: 3,
    autoApproveThreshold: 90,
    hardFailThreshold: 60,
  },
  assets: { providerOverride: null, mode: 'skip' },
}

interface AutopilotTemplate {
  id: string
  name: string
  is_default: boolean
  channel_id: string | null
  config_json: unknown
  created_at: string
}

interface Channel {
  id: string
  name: string
}

export default function AutopilotTemplatesPage() {
  const { id: channelId } = useParams<{ id: string }>()
  const router = useRouter()

  const [channel, setChannel] = useState<Channel | null>(null)
  const [templates, setTemplates] = useState<AutopilotTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createIsDefault, setCreateIsDefault] = useState(false)
  const [createConfigJson, setCreateConfigJson] = useState(
    JSON.stringify(MINIMAL_CONFIG_STUB, null, 2),
  )
  const [createConfigError, setCreateConfigError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Delete / set-default pending IDs
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setPageError(null)
    try {
      const [channelRes, templatesRes] = await Promise.all([
        fetch(`/api/channels/${channelId}`),
        fetch(`/api/autopilot-templates?channelId=${channelId}`),
      ])
      const channelJson = await channelRes.json()
      const templatesJson = await templatesRes.json()

      if (channelJson.error) {
        setPageError(channelJson.error.message ?? 'Failed to load channel')
        return
      }
      if (templatesJson.error) {
        setPageError(templatesJson.error.message ?? 'Failed to load templates')
        return
      }

      setChannel(channelJson.data)
      setTemplates(templatesJson.data?.items ?? [])
    } catch {
      setPageError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [channelId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function validateConfigJson(raw: string): unknown | null {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  async function handleCreate() {
    if (!createName.trim()) {
      toast.error('Name is required')
      return
    }
    const parsed = validateConfigJson(createConfigJson)
    if (parsed === null) {
      setCreateConfigError('Invalid JSON — please fix before saving')
      return
    }
    setCreateConfigError(null)
    setCreating(true)

    const body: CreateAutopilotTemplateInput = {
      name: createName.trim(),
      channelId,
      configJson: parsed as CreateAutopilotTemplateInput['configJson'],
      isDefault: createIsDefault,
    }

    try {
      const res = await fetch('/api/autopilot-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error.message ?? 'Failed to create template')
        return
      }
      toast.success('Template created')
      setCreateOpen(false)
      setCreateName('')
      setCreateIsDefault(false)
      setCreateConfigJson(JSON.stringify(MINIMAL_CONFIG_STUB, null, 2))
      fetchData()
    } catch {
      toast.error('Failed to create template')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(templateId: string) {
    setDeletingId(templateId)
    try {
      const res = await fetch(`/api/autopilot-templates/${templateId}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error.message ?? 'Failed to delete template')
        return
      }
      toast.success('Template deleted')
      setTemplates((prev) => prev.filter((t) => t.id !== templateId))
    } catch {
      toast.error('Failed to delete template')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleToggleDefault(template: AutopilotTemplate) {
    setTogglingId(template.id)
    try {
      const newDefault = !template.is_default
      const res = await fetch(`/api/autopilot-templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: newDefault }),
      })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error.message ?? 'Failed to update template')
        return
      }
      toast.success(newDefault ? 'Set as default' : 'Default cleared')
      fetchData()
    } catch {
      toast.error('Failed to update template')
    } finally {
      setTogglingId(null)
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="h-48 bg-muted animate-pulse rounded-lg" />
      </div>
    )
  }

  if (pageError) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <p className="text-sm text-destructive">{pageError}</p>
        <Button variant="outline" size="sm" onClick={fetchData}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header + breadcrumb */}
      <div className="space-y-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/channels/${channelId}`)}
          className="-ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {channel?.name ?? 'Channel'}
        </Button>
        <h1 className="text-2xl font-bold">Autopilot Templates</h1>
        <p className="text-sm text-muted-foreground">
          Manage reusable pipeline configurations for this channel.
        </p>
      </div>

      {/* Create button + dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Autopilot Template</DialogTitle>
            <DialogDescription>
              Give the template a name and optionally adjust the pipeline config JSON.
              Fine-grained editing is available in the Autopilot Wizard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="template-name">Name</Label>
              <Input
                id="template-name"
                placeholder="e.g. Standard Blog Run"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="is-default"
                checked={createIsDefault}
                onCheckedChange={setCreateIsDefault}
              />
              <Label htmlFor="is-default">Set as default for this channel</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="config-json">Pipeline Config (JSON)</Label>
              <Textarea
                id="config-json"
                value={createConfigJson}
                onChange={(e) => {
                  setCreateConfigJson(e.target.value)
                  setCreateConfigError(null)
                }}
                className="font-mono text-xs h-40 resize-none"
              />
              {createConfigError && (
                <p className="text-xs text-destructive">{createConfigError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Edit in the Autopilot Wizard after creation for full control.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !createName.trim()}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Templates list */}
      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No autopilot templates yet. Create one to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      {template.name}
                      {template.is_default && (
                        <Badge variant="secondary" className="text-[10px]">
                          Default
                        </Badge>
                      )}
                      {template.channel_id === null && (
                        <Badge variant="outline" className="text-[10px]">
                          Global
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Created{' '}
                      {new Date(template.created_at).toLocaleDateString('en-US', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Toggle default */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleDefault(template)}
                      disabled={togglingId === template.id}
                      title={template.is_default ? 'Clear default' : 'Set as default'}
                    >
                      {togglingId === template.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : template.is_default ? (
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      ) : (
                        <StarOff className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>

                    {/* Delete */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deletingId === template.id}
                        >
                          {deletingId === template.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Template?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete &ldquo;{template.name}&rdquo;. This action
                            cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(template.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
