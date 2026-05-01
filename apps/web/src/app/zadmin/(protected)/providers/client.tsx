'use client'

import { useState } from 'react'
import { Check, Eye, EyeOff, KeyRound, Plus, Save, Trash2, Zap } from 'lucide-react'

interface Provider {
  id: string
  provider: string
  isActive: boolean
  hasApiKey: boolean
  modelsJson: string[]
  updatedAt: string
}

interface CardState {
  isActive: boolean
  hasApiKey: boolean
  apiKey: string
  models: string[]
  dirty: boolean
  saving: boolean
  saved: boolean
  error: string | null
}

const PROVIDER_LABELS: Record<string, string> = {
  gemini:    'Gemini (Google)',
  openai:    'OpenAI',
  anthropic: 'Anthropic (Claude)',
  ollama:    'Ollama (local)',
  manual:    'Manual (human-in-the-loop)',
}

const PROVIDER_COLORS: Record<string, string> = {
  gemini:    'text-blue-400 bg-blue-500/10 border-blue-500/20',
  openai:    'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  anthropic: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  ollama:    'text-purple-400 bg-purple-500/10 border-purple-500/20',
  manual:    'text-rose-400 bg-rose-500/10 border-rose-500/20',
}

export function ProvidersClient({ initialProviders }: { initialProviders: Provider[] }) {
  const [cards, setCards] = useState<Record<string, CardState>>(() =>
    Object.fromEntries(
      initialProviders.map(p => [
        p.id,
        {
          isActive: p.isActive,
          hasApiKey: p.hasApiKey,
          apiKey: '',
          models: [...p.modelsJson],
          dirty: false,
          saving: false,
          saved: false,
          error: null,
        },
      ])
    )
  )
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})
  const [newModel, setNewModel] = useState<Record<string, string>>({})

  function update(id: string, patch: Partial<CardState>) {
    setCards(prev => ({
      ...prev,
      [id]: { ...prev[id], ...patch, dirty: true, saved: false },
    }))
  }

  function addModel(id: string) {
    const val = (newModel[id] ?? '').trim()
    if (!val) return
    const card = cards[id]
    if (card.models.includes(val)) return
    update(id, { models: [...card.models, val] })
    setNewModel(prev => ({ ...prev, [id]: '' }))
  }

  function removeModel(id: string, model: string) {
    update(id, { models: cards[id].models.filter(m => m !== model) })
  }

  async function save(id: string) {
    const card = cards[id]
    setCards(prev => ({ ...prev, [id]: { ...prev[id], saving: true, error: null } }))

    const body: Record<string, unknown> = {
      isActive:   card.isActive,
      modelsJson: card.models,
    }
    if (card.apiKey.trim()) body.apiKey = card.apiKey.trim()

    try {
      const res = await fetch(`/api/ai-providers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error.message)
      setCards(prev => ({
        ...prev,
        [id]: {
          ...prev[id],
          saving: false,
          dirty: false,
          saved: true,
          apiKey: '',
          hasApiKey: json.data.hasApiKey,
        },
      }))
      setTimeout(() => setCards(prev => ({ ...prev, [id]: { ...prev[id], saved: false } })), 2500)
    } catch (e: unknown) {
      setCards(prev => ({
        ...prev,
        [id]: { ...prev[id], saving: false, error: e instanceof Error ? e.message : 'Save failed' },
      }))
    }
  }

  return (
    <div className="min-h-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">AI Providers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enable providers, set API keys, and manage which models are available per provider.
        </p>
      </div>

      <div className="space-y-5">
        {initialProviders.map(p => {
          const card = cards[p.id]
          const color = PROVIDER_COLORS[p.provider] ?? 'text-muted-foreground bg-muted border-border'
          const isManual = p.provider === 'manual'

          return (
            <div key={p.id} className="rounded-xl border border-border bg-card">
              {/* Header */}
              <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${color}`}>
                    {PROVIDER_LABELS[p.provider] ?? p.provider}
                  </span>
                  {card.isActive && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                      <Zap size={11} /> Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {card.saved && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <Check size={12} /> Saved
                    </span>
                  )}
                  {card.error && (
                    <span className="text-xs text-destructive">{card.error}</span>
                  )}
                  <button
                    onClick={() => save(p.id)}
                    disabled={!card.dirty || card.saving}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      card.dirty && !card.saving
                        ? 'bg-[#2DD4A8] text-[#0A1017]'
                        : 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <Save size={13} />
                    {card.saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              <div className="px-5 py-4 space-y-5">
                {/* On/Off */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Enable provider</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {card.isActive ? 'Jobs can use this provider.' : 'Provider is disabled — jobs will skip it.'}
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={card.isActive}
                    onClick={() => update(p.id, { isActive: !card.isActive })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      card.isActive ? 'bg-[#2DD4A8]' : 'bg-muted'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        card.isActive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* API Key — not shown for manual provider */}
                {!isManual && (
                  <div>
                    <p className="text-sm font-medium mb-1.5">API Key</p>
                    {card.hasApiKey && !card.apiKey && (
                      <p className="text-xs text-emerald-400 flex items-center gap-1 mb-1.5">
                        <KeyRound size={11} /> Key is set — enter a new value to replace it
                      </p>
                    )}
                    <div className="relative">
                      <input
                        type={showKey[p.id] ? 'text' : 'password'}
                        value={card.apiKey}
                        onChange={e => update(p.id, { apiKey: e.target.value })}
                        placeholder={card.hasApiKey ? '••••••••••••••••' : 'Paste API key…'}
                        className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#2DD4A8]/40 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showKey[p.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Models */}
                <div>
                  <p className="text-sm font-medium mb-1.5">
                    Available models
                    {p.provider === 'ollama' && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        — add your locally pulled model names
                      </span>
                    )}
                    {isManual && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        — no models (human-in-the-loop)
                      </span>
                    )}
                  </p>

                  {!isManual && (
                    <>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {card.models.map(m => (
                          <span
                            key={m}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-border bg-background"
                          >
                            {m}
                            <button
                              onClick={() => removeModel(p.id, m)}
                              className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                            >
                              <Trash2 size={10} />
                            </button>
                          </span>
                        ))}
                        {card.models.length === 0 && (
                          <span className="text-xs text-muted-foreground">No models — add one below.</span>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <input
                          value={newModel[p.id] ?? ''}
                          onChange={e => setNewModel(prev => ({ ...prev, [p.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && addModel(p.id)}
                          placeholder="e.g. gemini-2.5-flash"
                          className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#2DD4A8]/40 font-mono"
                        />
                        <button
                          onClick={() => addModel(p.id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-card transition-colors"
                        >
                          <Plus size={13} /> Add
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground text-right">
                  Last updated: {new Date(p.updatedAt).toLocaleString()}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
