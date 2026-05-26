'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  DollarSign,
  Users,
  Clock,
  TrendingUp,
  Save,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react'
import { useAdminPaths } from '@/lib/use-admin-paths'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PricingState {
  extraBlockCredits: number
  extraBlockPriceUsdCents: number
  freeTierMonthlyCredits: number
  freeTierSignupBonusCredits: number
  freeTierBonusValidityDays: number
}

interface SlaState {
  p0_mins: number
  p1_mins: number
  p2_mins: number
  p3_mins: number
}

interface MarginsState {
  green_pct: number
  yellow_pct: number
}

interface CurrencyRate {
  currency: string
  rateToUsd: number
  fetchedAt: string
  source: string
}

type SaveStatus =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_PRICING: PricingState = {
  extraBlockCredits: 1000,
  extraBlockPriceUsdCents: 500,
  freeTierMonthlyCredits: 500,
  freeTierSignupBonusCredits: 2000,
  freeTierBonusValidityDays: 7,
}

const DEFAULT_SLA: SlaState = { p0_mins: 15, p1_mins: 120, p2_mins: 480, p3_mins: 1440 }
const DEFAULT_MARGINS: MarginsState = { green_pct: 40, yellow_pct: 20 }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function minsToLabel(mins: number): string {
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'agora há pouco'
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBanner({ status }: { status: SaveStatus }) {
  if (!status) return null
  const ok = status.kind === 'success'
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
        ok
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-red-500/30 bg-red-500/10 text-red-400'
      }`}
    >
      {ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
      {status.message}
    </div>
  )
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)]">
        <Icon className="h-4 w-4 text-[var(--primary,#2DD4A8)]" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-[var(--foreground,#e6edf7)]">{title}</h2>
        <p className="text-xs text-[var(--muted-foreground,#8b98b0)]">{subtitle}</p>
      </div>
    </div>
  )
}

function NumberField({
  label,
  hint,
  value,
  min,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  value: number
  min?: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
        {label}
      </label>
      <input
        type="number"
        min={min ?? 0}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--card,#121826)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50 disabled:opacity-50"
      />
      {hint && <p className="text-xs text-[var(--muted-foreground,#8b98b0)]">{hint}</p>}
    </div>
  )
}

function SaveButton({ saving, label }: { saving: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={saving}
      className="flex items-center gap-2 rounded-lg bg-[var(--primary,#2DD4A8)] px-5 py-2.5 text-sm font-semibold text-[var(--background,#0a0e1a)] transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {label ?? 'Salvar'}
    </button>
  )
}

// ─── Section: Pricing ─────────────────────────────────────────────────────────

function PricingSection({
  initial,
  canWrite,
  onSaved,
}: {
  initial: PricingState
  canWrite: boolean
  onSaved: () => void
}) {
  const { adminApi } = useAdminPaths()
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<SaveStatus>(null)

  useEffect(() => { setForm(initial) }, [initial])

  function set(key: keyof PricingState) {
    return (v: number) => setForm((p) => ({ ...p, [key]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch(adminApi('/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json() as { data: unknown; error: { message: string } | null }
      if (!res.ok || json.error) {
        setStatus({ kind: 'error', message: json.error?.message ?? 'Erro ao salvar.' })
        return
      }
      setStatus({ kind: 'success', message: 'Configurações de preços atualizadas.' })
      onSaved()
    } catch {
      setStatus({ kind: 'error', message: 'Falha de rede.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <SectionHeader icon={DollarSign} title="Pricing config" subtitle="Block size do top-up, free tier e bônus de cadastro" />
      <StatusBanner status={status} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          label="Tokens por bloco (top-up)"
          hint="Quantidade de tokens por bloco adicional"
          value={form.extraBlockCredits}
          min={1}
          onChange={set('extraBlockCredits')}
          disabled={!canWrite}
        />
        <NumberField
          label="Preço do bloco (centavos USD)"
          hint={`= $${(form.extraBlockPriceUsdCents / 100).toFixed(2)} por bloco`}
          value={form.extraBlockPriceUsdCents}
          min={1}
          onChange={set('extraBlockPriceUsdCents')}
          disabled={!canWrite}
        />
        <NumberField
          label="Free tier — créditos mensais"
          hint="Recarga mensal do free tier"
          value={form.freeTierMonthlyCredits}
          min={0}
          onChange={set('freeTierMonthlyCredits')}
          disabled={!canWrite}
        />
        <NumberField
          label="Bônus de cadastro (tokens)"
          hint="Tokens dados ao criar conta"
          value={form.freeTierSignupBonusCredits}
          min={0}
          onChange={set('freeTierSignupBonusCredits')}
          disabled={!canWrite}
        />
        <NumberField
          label="Validade do bônus (dias)"
          hint="Quantos dias o bônus de cadastro dura"
          value={form.freeTierBonusValidityDays}
          min={1}
          onChange={set('freeTierBonusValidityDays')}
          disabled={!canWrite}
        />
      </div>

      <div className="rounded-lg border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)]/40 px-4 py-3 text-xs text-[var(--muted-foreground,#8b98b0)]">
        <Info className="inline h-3.5 w-3.5 mr-1 align-middle" />
        Custo por token: <span className="font-mono text-[var(--foreground,#e6edf7)]">
          ${(form.extraBlockPriceUsdCents / form.extraBlockCredits / 100).toFixed(5)}
        </span> USD
      </div>

      {canWrite && <SaveButton saving={saving} />}
    </form>
  )
}

// ─── Section: SLAs ────────────────────────────────────────────────────────────

const SLA_LABELS = [
  { key: 'p0_mins', label: 'P0 — Crítico', color: 'text-red-400' },
  { key: 'p1_mins', label: 'P1 — Alta', color: 'text-orange-400' },
  { key: 'p2_mins', label: 'P2 — Média', color: 'text-yellow-400' },
  { key: 'p3_mins', label: 'P3 — Baixa', color: 'text-[var(--muted-foreground,#8b98b0)]' },
] as const

function SlaSection({
  initial,
  canWrite,
  onSaved,
}: {
  initial: SlaState
  canWrite: boolean
  onSaved: () => void
}) {
  const { adminApi } = useAdminPaths()
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<SaveStatus>(null)

  useEffect(() => { setForm(initial) }, [initial])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch(adminApi('/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sla: form }),
      })
      const json = await res.json() as { data: unknown; error: { message: string } | null }
      if (!res.ok || json.error) {
        setStatus({ kind: 'error', message: json.error?.message ?? 'Erro ao salvar.' })
        return
      }
      setStatus({ kind: 'success', message: 'SLAs de suporte atualizados.' })
      onSaved()
    } catch {
      setStatus({ kind: 'error', message: 'Falha de rede.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <SectionHeader icon={Clock} title="SLAs de suporte" subtitle="Tempo máximo de resposta por prioridade (em minutos)" />
      <StatusBanner status={status} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SLA_LABELS.map(({ key, label, color }) => (
          <div key={key} className="space-y-1.5">
            <label className={`text-xs font-semibold uppercase tracking-wider ${color}`}>
              {label}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                value={form[key]}
                disabled={!canWrite}
                onChange={(e) => setForm((p) => ({ ...p, [key]: Number(e.target.value) }))}
                className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--card,#121826)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50 disabled:opacity-50"
              />
              <span className="shrink-0 text-xs text-[var(--muted-foreground,#8b98b0)] w-14 text-right">
                {minsToLabel(form[key])}
              </span>
            </div>
          </div>
        ))}
      </div>

      {canWrite && <SaveButton saving={saving} />}
    </form>
  )
}

// ─── Section: Margin thresholds ───────────────────────────────────────────────

function MarginsSection({
  initial,
  canWrite,
  onSaved,
}: {
  initial: MarginsState
  canWrite: boolean
  onSaved: () => void
}) {
  const { adminApi } = useAdminPaths()
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<SaveStatus>(null)

  useEffect(() => { setForm(initial) }, [initial])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch(adminApi('/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ margins: form }),
      })
      const json = await res.json() as { data: unknown; error: { message: string } | null }
      if (!res.ok || json.error) {
        setStatus({ kind: 'error', message: json.error?.message ?? 'Erro ao salvar.' })
        return
      }
      setStatus({ kind: 'success', message: 'Thresholds de margem atualizados.' })
      onSaved()
    } catch {
      setStatus({ kind: 'error', message: 'Falha de rede.' })
    } finally {
      setSaving(false)
    }
  }

  const redPct = form.yellow_pct

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <SectionHeader icon={TrendingUp} title="Thresholds de margem" subtitle="Limites para semáforo no finance dashboard" />
      <StatusBanner status={status} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Verde (margem ≥ N%)
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={form.green_pct}
            disabled={!canWrite}
            onChange={(e) => setForm((p) => ({ ...p, green_pct: Number(e.target.value) }))}
            className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--card,#121826)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50 disabled:opacity-50"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-yellow-400">
            Amarelo (margem ≥ N%)
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={form.yellow_pct}
            disabled={!canWrite}
            onChange={(e) => setForm((p) => ({ ...p, yellow_pct: Number(e.target.value) }))}
            className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--card,#121826)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50 disabled:opacity-50"
          />
        </div>
      </div>

      {/* Visual legend */}
      <div className="flex gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-emerald-500" />
          <span className="text-[var(--muted-foreground,#8b98b0)]">≥ {form.green_pct}%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-yellow-500" />
          <span className="text-[var(--muted-foreground,#8b98b0)]">{form.yellow_pct}% – {form.green_pct}%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="text-[var(--muted-foreground,#8b98b0)]">&lt; {redPct}%</span>
        </span>
      </div>

      {canWrite && <SaveButton saving={saving} />}
    </form>
  )
}

// ─── Section: Currency rates ───────────────────────────────────────────────────

function CurrencySection({ rates, onRefresh }: { rates: CurrencyRate[]; onRefresh: () => void }) {
  const [refreshing, setRefreshing] = useState(false)
  const [status, setStatus] = useState<SaveStatus>(null)

  async function handleRefresh() {
    setRefreshing(true)
    setStatus(null)
    try {
      const res = await fetch('/api/currency-refresh', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStatus({ kind: 'success', message: 'Cotações atualizadas.' })
      onRefresh()
    } catch {
      setStatus({ kind: 'error', message: 'Falha ao atualizar cotações.' })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader icon={DollarSign} title="Cotação USD" subtitle="Taxas de câmbio usadas no sistema (atualizadas diariamente via cron)" />
      <StatusBanner status={status} />

      <div className="overflow-hidden rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)]">
        {rates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--muted-foreground,#8b98b0)]">
            <DollarSign className="mb-2 h-7 w-7 opacity-30" />
            <p className="text-sm">Nenhuma cotação disponível — rode o cron pela primeira vez.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)]/50 text-left text-xs uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
                <th className="px-4 py-3 font-semibold">Moeda</th>
                <th className="px-4 py-3 font-semibold text-right">1 USD =</th>
                <th className="px-4 py-3 font-semibold text-right">Atualizado</th>
                <th className="px-4 py-3 font-semibold">Fonte</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.currency} className="border-b border-[var(--border,#263146)] last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-[var(--foreground,#e6edf7)]">{r.currency}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--foreground,#e6edf7)]">
                    {r.rateToUsd.toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-[var(--muted-foreground,#8b98b0)]">
                    {relativeDate(r.fetchedAt)}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted-foreground,#8b98b0)]">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        className="flex items-center gap-2 rounded-lg border border-[var(--border,#263146)] px-4 py-2.5 text-sm font-medium text-[var(--foreground,#e6edf7)] hover:border-[var(--primary,#2DD4A8)]/50 transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        Atualizar cotações agora
      </button>
    </div>
  )
}

// ─── Section: Permissions ─────────────────────────────────────────────────────

const ROLE_CAPS: Record<string, string[]> = {
  owner:    ['Tudo — acesso irrestrito'],
  admin:    ['Editar configs, providers, usuários, cupons, planos'],
  support:  ['Ver usuários, abrir/responder tickets, ver notificações'],
  billing:  ['Ver finance dashboard, refunds, transações'],
  readonly: ['Somente leitura em todas as seções'],
}

function PermissionsSection() {
  return (
    <div className="space-y-5">
      <SectionHeader icon={Users} title="Permissões por papel" subtitle="O que cada papel de manager pode fazer no painel" />
      <div className="overflow-hidden rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)]/50 text-left text-xs uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
              <th className="px-4 py-3 font-semibold">Papel</th>
              <th className="px-4 py-3 font-semibold">Capacidades</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(ROLE_CAPS).map(([role, caps]) => (
              <tr key={role} className="border-b border-[var(--border,#263146)] last:border-0">
                <td className="px-4 py-3">
                  <span className="rounded-md border border-[var(--border,#263146)] px-2 py-0.5 text-xs font-mono text-[var(--primary,#2DD4A8)]">
                    {role}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted-foreground,#8b98b0)]">
                  {caps.join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--muted-foreground,#8b98b0)]">
        Papéis são atribuídos em{' '}
        <a href="/zadmin/managers" className="text-[var(--primary,#2DD4A8)] hover:underline">
          Managers
        </a>
        . Granularidade adicional (ex: delegar reset de tokens ao support) é configurável por código em{' '}
        <code className="rounded bg-[var(--background,#0a0e1a)] px-1 py-0.5 text-[11px]">
          apps/web/src/app/zadmin/(protected)/layout.tsx
        </code>
        .
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface SettingsData {
  pricing: PricingState
  sla: SlaState
  margins: MarginsState
  currencyRates: CurrencyRate[]
  updatedAt: string
}

export default function AdminSettingsClient({ canWrite }: { canWrite: boolean }) {
  const { adminApi } = useAdminPaths()
  const [data, setData] = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(adminApi('/settings'))
      const json = await res.json() as { data: SettingsData | null; error: { message: string } | null }
      if (!res.ok || json.error) {
        setError(json.error?.message ?? 'Erro ao carregar configurações.')
        return
      }
      setData(json.data)
    } catch {
      setError('Falha de rede.')
    } finally {
      setLoading(false)
    }
  }, [adminApi])

  useEffect(() => { void fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-[var(--muted-foreground,#8b98b0)]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error ?? 'Configurações não encontradas.'}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground,#e6edf7)]">Configurações do admin</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground,#8b98b0)]">
            Pricing, SLAs de suporte, thresholds de margem e cotações.
          </p>
        </div>
        {data.updatedAt && (
          <span className="shrink-0 text-xs text-[var(--muted-foreground,#8b98b0)]">
            Salvo {relativeDate(data.updatedAt)}
          </span>
        )}
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 gap-6">
        <div className="rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)] p-6">
          <PricingSection initial={data?.pricing ?? DEFAULT_PRICING} canWrite={canWrite} onSaved={fetchData} />
        </div>

        <div className="rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)] p-6">
          <SlaSection initial={data?.sla ?? DEFAULT_SLA} canWrite={canWrite} onSaved={fetchData} />
        </div>

        <div className="rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)] p-6">
          <MarginsSection initial={data?.margins ?? DEFAULT_MARGINS} canWrite={canWrite} onSaved={fetchData} />
        </div>

        <div className="rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)] p-6">
          <CurrencySection rates={data?.currencyRates ?? []} onRefresh={fetchData} />
        </div>

        <div className="rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)] p-6">
          <PermissionsSection />
        </div>
      </div>
    </div>
  )
}
