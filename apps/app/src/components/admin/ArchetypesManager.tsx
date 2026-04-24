'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, ChevronDown, ChevronUp, Eye } from 'lucide-react'

interface ArchetypeOverlay {
  constraints: string[]
  behavioralAdditions: string[]
}

interface Archetype {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  defaultFieldsJson: Record<string, unknown>
  behavioralOverlayJson: ArchetypeOverlay
  sortOrder: number
  isActive: boolean
}

export function ArchetypesManager() {
  const [archetypes, setArchetypes] = useState<Archetype[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/agents/personas/archetypes')
      .then(r => r.json())
      .then(({ data }) => setArchetypes(data ?? []))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggle(id: string, isActive: boolean) {
    await fetch(`/api/agents/personas/archetypes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    })
    setArchetypes(prev => prev.map(a => a.id === id ? { ...a, isActive } : a))
  }

  async function handleSave(a: Archetype) {
    setSaving(a.id)
    await fetch(`/api/agents/personas/archetypes/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: a.name,
        description: a.description,
        icon: a.icon,
        behavioralOverlayJson: a.behavioralOverlayJson,
        sortOrder: a.sortOrder,
        isActive: a.isActive,
      }),
    })
    setSaving(null)
  }

  async function handleCreate() {
    const slug = `archetype-${Date.now()}`
    const res = await fetch('/api/agents/personas/archetypes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        name: 'New Archetype',
        description: '',
        icon: '',
        defaultFieldsJson: {},
        behavioralOverlayJson: { constraints: [], behavioralAdditions: [] },
        sortOrder: archetypes.length,
        isActive: false,
      }),
    })
    const { data } = await res.json()
    if (data) {
      setArchetypes(prev => [...prev, data])
      setExpanded(data.id)
    }
  }

  function updateOverlayField(id: string, field: keyof ArchetypeOverlay, value: string) {
    const lines = value.split('\n').filter(Boolean)
    setArchetypes(prev => prev.map(a =>
      a.id === id
        ? { ...a, behavioralOverlayJson: { ...a.behavioralOverlayJson, [field]: lines } }
        : a
    ))
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      {archetypes.map(a => (
        <Card key={a.id} className={a.isActive ? '' : 'opacity-60'}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <Switch checked={a.isActive} onCheckedChange={v => handleToggle(a.id, v)} />
              <Input
                value={a.name}
                onChange={e => setArchetypes(prev => prev.map(r => r.id === a.id ? { ...r, name: e.target.value } : r))}
                className="h-8 font-semibold flex-1"
              />
              <Badge variant="outline" className="font-mono text-xs">{a.slug}</Badge>
              <button onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
                {expanded === a.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </CardHeader>

          {expanded === a.id && (
            <CardContent className="space-y-4 pt-0">
              <Input
                value={a.description}
                onChange={e => setArchetypes(prev => prev.map(r => r.id === a.id ? { ...r, description: e.target.value } : r))}
                placeholder="Description shown to users on archetype picker"
              />

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  Hidden overlay — not visible to users
                </p>
                <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Constraints (one per line)</p>
                    <Textarea
                      value={a.behavioralOverlayJson.constraints.join('\n')}
                      onChange={e => updateOverlayField(a.id, 'constraints', e.target.value)}
                      placeholder="Always cite sources&#10;Never use first-person..."
                      className="font-mono text-xs min-h-[80px]"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Behavioral additions (one per line)</p>
                    <Textarea
                      value={a.behavioralOverlayJson.behavioralAdditions.join('\n')}
                      onChange={e => updateOverlayField(a.id, 'behavioralAdditions', e.target.value)}
                      placeholder="Lead with data&#10;Prefer concrete examples..."
                      className="font-mono text-xs min-h-[80px]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button size="sm" onClick={() => handleSave(a)} disabled={saving === a.id}>
                  {saving === a.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Save
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      ))}

      {archetypes.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No archetypes yet.</p>
      )}

      <Button variant="outline" onClick={handleCreate} className="w-full">
        <Plus className="h-4 w-4 mr-1" /> New Archetype
      </Button>
    </div>
  )
}
