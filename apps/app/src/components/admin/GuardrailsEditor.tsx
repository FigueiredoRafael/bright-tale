'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Plus, Trash2 } from 'lucide-react'

type Category = 'content_boundaries' | 'tone_constraints' | 'factual_rules' | 'behavioral_rules'

interface Guardrail {
  id: string
  category: Category
  label: string
  ruleText: string
  isActive: boolean
  sortOrder: number
}

const CATEGORIES: Category[] = ['content_boundaries', 'tone_constraints', 'factual_rules', 'behavioral_rules']
const CATEGORY_LABELS: Record<Category, string> = {
  content_boundaries: 'Content Boundaries',
  tone_constraints: 'Tone Constraints',
  factual_rules: 'Factual Rules',
  behavioral_rules: 'Behavioral Rules',
}

export function GuardrailsEditor() {
  const [guardrails, setGuardrails] = useState<Guardrail[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Category>('content_boundaries')
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/agents/personas/guardrails')
      .then(r => r.json())
      .then(({ data }) => setGuardrails(data ?? []))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggle(id: string, isActive: boolean) {
    setSaving(id)
    await fetch(`/api/agents/personas/guardrails/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    })
    setGuardrails(prev => prev.map(g => g.id === id ? { ...g, isActive } : g))
    setSaving(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this guardrail?')) return
    await fetch(`/api/agents/personas/guardrails/${id}`, { method: 'DELETE' })
    setGuardrails(prev => prev.filter(g => g.id !== id))
  }

  async function handleAdd() {
    const res = await fetch('/api/agents/personas/guardrails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: activeTab,
        label: 'New rule',
        ruleText: '',
        isActive: true,
        sortOrder: guardrails.filter(g => g.category === activeTab).length,
      }),
    })
    const { data } = await res.json()
    if (data) setGuardrails(prev => [...prev, data])
  }

  async function handleSave(g: Guardrail) {
    setSaving(g.id)
    await fetch(`/api/agents/personas/guardrails/${g.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: g.category, label: g.label, ruleText: g.ruleText, isActive: g.isActive, sortOrder: g.sortOrder }),
    })
    setSaving(null)
  }

  const filtered = guardrails.filter(g => g.category === activeTab)

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b pb-2">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${activeTab === cat ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(g => (
          <div key={g.id} className="border rounded-lg p-4 space-y-3 bg-card">
            <div className="flex items-center gap-3">
              <Switch
                checked={g.isActive}
                onCheckedChange={v => handleToggle(g.id, v)}
                disabled={saving === g.id}
              />
              <Input
                value={g.label}
                onChange={e => setGuardrails(prev => prev.map(r => r.id === g.id ? { ...r, label: e.target.value } : r))}
                placeholder="Rule label"
                className="flex-1 h-8 text-sm font-medium"
              />
              <Button size="sm" variant="ghost" onClick={() => handleDelete(g.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <Textarea
              value={g.ruleText}
              onChange={e => setGuardrails(prev => prev.map(r => r.id === g.id ? { ...r, ruleText: e.target.value } : r))}
              placeholder="Rule text injected into agent prompt..."
              className="text-sm font-mono min-h-[80px]"
            />
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => handleSave(g)} disabled={saving === g.id}>
                {saving === g.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Save
              </Button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No rules in this category yet.</p>
        )}
      </div>

      <Button size="sm" variant="outline" onClick={handleAdd} className="w-full">
        <Plus className="h-4 w-4 mr-1" /> Add Rule
      </Button>
    </div>
  )
}
