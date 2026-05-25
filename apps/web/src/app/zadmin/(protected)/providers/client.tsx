'use client'

import { useState } from 'react'
import { Check, Eye, EyeOff, KeyRound, Plus, Save, Trash2, Zap, Puzzle, RotateCcw, RefreshCw } from 'lucide-react'
import { MODULE_SLUGS, MODULE_LABELS, type ModuleSlug } from '@brighttale/shared/schemas/module-ai-assignments'

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

interface ModuleState {
  provider: string
  model: string
  dirty: boolean
  saving: boolean
  saved: boolean
  error: string | null
}

export function ProvidersClient({
  initialProviders,
  initialAssignments = {},
}: {
  initialProviders: Provider[]
  initialAssignments?: Record<string, { provider: string; model: string }>
}) {
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
  const [syncing, setSyncing] = useState<Record<string, boolean>>({})
  const [syncError, setSyncError] = useState<Record<string, string | null>>({})
  // Modal state: which provider is open + fetched model list + selected set
  const [syncModal, setSyncModal] = useState<{ providerId: string; fetched: string[] } | null>(null)
  const [syncSelected, setSyncSelected] = useState<Set<string>>(new Set())

  async function syncModels(id: string) {
    setSyncing(prev => ({ ...prev, [id]: true }))
    setSyncError(prev => ({ ...prev, [id]: null }))
    try {
      const res = await fetch(`/api/ai-providers/${id}/sync-models`, { method: 'POST' })
      const json = await res.json()
      if (json.error) throw new Error(json.error.message)
      const fetched: string[] = json.data.models
      // Pre-select only models not already in the list
      const existing = new Set(cards[id].models)
      const preSelected = new Set(fetched.filter(m => !existing.has(m)))
      setSyncSelected(preSelected)
      setSyncModal({ providerId: id, fetched })
    } catch (e: unknown) {
      setSyncError(prev => ({ ...prev, [id]: e instanceof Error ? e.message : 'Sync failed' }))
    } finally {
      setSyncing(prev => ({ ...prev, [id]: false }))
    }
  }

  function confirmSync() {
    if (!syncModal) return
    const { providerId } = syncModal
    setCards(prev => {
      const existing = prev[providerId].models
      const merged = Array.from(new Set([...existing, ...syncSelected])).sort()
      return { ...prev, [providerId]: { ...prev[providerId], models: merged, dirty: true, saved: false } }
    })
    setSyncModal(null)
  }

  const [modules, setModules] = useState<Record<ModuleSlug, ModuleState>>(() =>
    Object.fromEntries(
      MODULE_SLUGS.map(slug => [
        slug,
        {
          provider: initialAssignments[slug]?.provider ?? '',
          model:    initialAssignments[slug]?.model ?? '',
          dirty:    false,
          saving:   false,
          saved:    false,
          error:    null,
        },
      ])
    ) as Record<ModuleSlug, ModuleState>
  )

  function updateModule(slug: ModuleSlug, patch: Partial<ModuleState>) {
    setModules(prev => ({ ...prev, [slug]: { ...prev[slug], ...patch, dirty: true, saved: false } }))
  }

  async function saveModule(slug: ModuleSlug) {
    const m = modules[slug]
    if (!m.provider || !m.model) return
    setModules(prev => ({ ...prev, [slug]: { ...prev[slug], saving: true, error: null } }))
    try {
      const res = await fetch('/api/ai-providers/module-assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleSlug: slug, provider: m.provider, model: m.model }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error.message)
      setModules(prev => ({ ...prev, [slug]: { ...prev[slug], saving: false, dirty: false, saved: true } }))
      setTimeout(() => setModules(prev => ({ ...prev, [slug]: { ...prev[slug], saved: false } })), 2500)
    } catch (e: unknown) {
      setModules(prev => ({ ...prev, [slug]: { ...prev[slug], saving: false, error: e instanceof Error ? e.message : 'Save failed' } }))
    }
  }

  async function resetModule(slug: ModuleSlug) {
    setModules(prev => ({ ...prev, [slug]: { ...prev[slug], saving: true, error: null } }))
    try {
      const res = await fetch(`/api/ai-providers/module-assignments/${slug}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) throw new Error(json.error.message)
      setModules(prev => ({ ...prev, [slug]: { provider: '', model: '', dirty: false, saving: false, saved: true, error: null } }))
      setTimeout(() => setModules(prev => ({ ...prev, [slug]: { ...prev[slug], saved: false } })), 2500)
    } catch (e: unknown) {
      setModules(prev => ({ ...prev, [slug]: { ...prev[slug], saving: false, error: e instanceof Error ? e.message : 'Reset failed' } }))
    }
  }

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

  const syncingProvider = syncModal ? initialProviders.find(p => p.id === syncModal.providerId) : null

  return (
    <>
    {/* ── Sync Modal ──────────────────────────────────────────────────────── */}
    {syncModal && syncingProvider && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-semibold text-sm">Modelos disponíveis — {PROVIDER_LABELS[syncingProvider.provider] ?? syncingProvider.provider}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {syncModal.fetched.length} encontrados · {syncSelected.size} selecionados
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSyncSelected(new Set(syncModal.fetched))}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:border-foreground/30"
              >
                Todos
              </button>
              <button
                onClick={() => setSyncSelected(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:border-foreground/30"
              >
                Nenhum
              </button>
            </div>
          </div>

          {/* Model list */}
          <div className="overflow-y-auto flex-1 px-3 py-2">
            {syncModal.fetched.map(model => {
              const alreadyAdded = cards[syncModal.providerId].models.includes(model)
              const checked = syncSelected.has(model)
              return (
                <label
                  key={model}
                  className={`flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${alreadyAdded ? 'opacity-40' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={alreadyAdded}
                    onChange={() => {
                      setSyncSelected(prev => {
                        const next = new Set(prev)
                        next.has(model) ? next.delete(model) : next.add(model)
                        return next
                      })
                    }}
                    className="accent-[#2DD4A8] w-4 h-4 shrink-0"
                  />
                  <span className="text-sm font-mono truncate">{model}</span>
                  {alreadyAdded && <span className="text-[10px] text-muted-foreground ml-auto shrink-0">já adicionado</span>}
                </label>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-3 shrink-0">
            <button
              onClick={() => setSyncModal(null)}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={confirmSync}
              disabled={syncSelected.size === 0}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                syncSelected.size > 0 ? 'bg-[#2DD4A8] text-[#0A1017]' : 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed'
              }`}
            >
              <Plus size={13} /> Adicionar {syncSelected.size > 0 ? syncSelected.size : ''} selecionado{syncSelected.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    )}

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
          const isOllama = p.provider === 'ollama'

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

                {/* API Key — not shown for manual or ollama (local, no key needed) */}
                {!isManual && !isOllama && (
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
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-medium">
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
                    {!isManual && !isOllama && (
                      <div className="flex items-center gap-2">
                        {syncError[p.id] && (
                          <span className="text-xs text-destructive">{syncError[p.id]}</span>
                        )}
                        <button
                          onClick={() => syncModels(p.id)}
                          disabled={syncing[p.id] || !cards[p.id].hasApiKey}
                          title={!cards[p.id].hasApiKey ? 'Configure a API key primeiro' : 'Buscar modelos atuais do provider'}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <RefreshCw size={11} className={syncing[p.id] ? 'animate-spin' : ''} />
                          {syncing[p.id] ? 'Buscando…' : 'Sync'}
                        </button>
                      </div>
                    )}
                  </div>

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

      {/* ── Module AI Assignments ─────────────────────────────────────────── */}
      <div className="mt-10">
        <div className="mb-6">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Puzzle size={16} className="text-muted-foreground" />
            Módulos de Chat
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Atribua um provider/modelo específico para cada módulo. Sem atribuição, o módulo usa o provider global ativo.
          </p>
        </div>

        <div className="space-y-4">
          {MODULE_SLUGS.map(slug => {
            const m = modules[slug]
            const selectedProvider = initialProviders.find(p => p.provider === m.provider)
            const hasAssignment = !!initialAssignments[slug] && !m.dirty
            const modelOptions = selectedProvider?.modelsJson ?? []

            return (
              <div key={slug} className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{MODULE_LABELS[slug]}</span>
                    {hasAssignment ? (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${PROVIDER_COLORS[initialAssignments[slug].provider] ?? 'text-muted-foreground bg-muted border-border'}`}>
                        {PROVIDER_LABELS[initialAssignments[slug].provider] ?? initialAssignments[slug].provider}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground px-2.5 py-1 rounded-full border border-border bg-muted">
                        usando provider global
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {m.saved && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <Check size={12} /> Salvo
                      </span>
                    )}
                    {m.error && <span className="text-xs text-destructive">{m.error}</span>}
                    {(hasAssignment || (initialAssignments[slug] && !m.dirty)) && (
                      <button
                        onClick={() => resetModule(slug)}
                        disabled={m.saving}
                        title="Remover atribuição (volta ao global)"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors disabled:opacity-50"
                      >
                        <RotateCcw size={12} /> Resetar
                      </button>
                    )}
                    <button
                      onClick={() => saveModule(slug)}
                      disabled={!m.dirty || m.saving || !m.provider || !m.model}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        m.dirty && !m.saving && m.provider && m.model
                          ? 'bg-[#2DD4A8] text-[#0A1017]'
                          : 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <Save size={13} />
                      {m.saving ? 'Salvando…' : 'Salvar'}
                    </button>
                  </div>
                </div>

                <div className="px-5 py-4 grid grid-cols-2 gap-4">
                  {/* Provider select */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Provider</p>
                    <select
                      value={m.provider}
                      onChange={e => updateModule(slug, { provider: e.target.value, model: '' })}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#2DD4A8]/40"
                    >
                      <option value="">— escolher —</option>
                      {initialProviders.filter(p => p.provider !== 'manual').map(p => (
                        <option key={p.id} value={p.provider}>
                          {PROVIDER_LABELS[p.provider] ?? p.provider}{!p.isActive ? ' (inativo)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Model — select when provider has models, free text otherwise */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Modelo</p>
                    {modelOptions.length > 0 ? (
                      <select
                        value={m.model}
                        onChange={e => updateModule(slug, { model: e.target.value })}
                        disabled={!m.provider}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#2DD4A8]/40 font-mono disabled:opacity-40"
                      >
                        <option value="">— escolher modelo —</option>
                        {modelOptions.map(mo => (
                          <option key={mo} value={mo}>{mo}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={m.model}
                        onChange={e => updateModule(slug, { model: e.target.value })}
                        placeholder={m.provider ? 'ex: gpt-4o-mini' : 'Escolha um provider primeiro'}
                        disabled={!m.provider}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#2DD4A8]/40 font-mono disabled:opacity-40"
                      />
                    )}
                    {!m.provider && (
                      <p className="text-[11px] text-muted-foreground mt-1">Selecione um provider primeiro</p>
                    )}
                    {m.provider && modelOptions.length === 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Nenhum modelo cadastrado — adicione em Available models acima
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
    </>
  )
}
