'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Package, ToggleLeft, ToggleRight, Save, Loader2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PlanConfigRow {
  id: string;
  plan_id: string;
  display_name: string;
  credits: number;
  price_usd_monthly_cents: number;
  price_usd_annual_cents: number;
  display_price_brl_monthly: number;
  display_price_brl_annual: number;
  stripe_price_id_monthly_test: string | null;
  stripe_price_id_annual_test: string | null;
  stripe_price_id_monthly_live: string | null;
  stripe_price_id_annual_live: string | null;
  is_active: boolean;
  sort_order: number;
}

interface PlanState {
  priceUsdMonthlyCents: string;
  priceUsdAnnualCents: string;
  displayPriceBrlMonthly: string;
  displayPriceBrlAnnual: string;
  stripePriceIdMonthlyTest: string;
  stripePriceIdAnnualTest: string;
  stripePriceIdMonthlyLive: string;
  stripePriceIdAnnualLive: string;
}

function planToState(row: PlanConfigRow): PlanState {
  return {
    priceUsdMonthlyCents: String(row.price_usd_monthly_cents),
    priceUsdAnnualCents: String(row.price_usd_annual_cents),
    displayPriceBrlMonthly: String(row.display_price_brl_monthly),
    displayPriceBrlAnnual: String(row.display_price_brl_annual),
    stripePriceIdMonthlyTest: row.stripe_price_id_monthly_test ?? '',
    stripePriceIdAnnualTest: row.stripe_price_id_annual_test ?? '',
    stripePriceIdMonthlyLive: row.stripe_price_id_monthly_live ?? '',
    stripePriceIdAnnualLive: row.stripe_price_id_annual_live ?? '',
  };
}

function Field({ label, value, onChange, mono }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400 dark:text-v-dim">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`px-2.5 py-1.5 text-xs rounded-md bg-slate-50 dark:bg-dash-bg border border-slate-200 dark:border-dash-border text-slate-800 dark:text-v-primary focus:outline-none focus:ring-1 focus:ring-brand-500 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}

function PlanCard({ row, onSaved }: { row: PlanConfigRow; onSaved: () => void }) {
  const [state, setState] = useState<PlanState>(() => planToState(row));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const update = useCallback((key: keyof PlanState) => (v: string) => setState((prev) => ({ ...prev, [key]: v })), []);

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const body = {
        priceUsdMonthlyCents: parseInt(state.priceUsdMonthlyCents, 10) || 0,
        priceUsdAnnualCents: parseInt(state.priceUsdAnnualCents, 10) || 0,
        displayPriceBrlMonthly: parseInt(state.displayPriceBrlMonthly, 10) || 0,
        displayPriceBrlAnnual: parseInt(state.displayPriceBrlAnnual, 10) || 0,
        stripePriceIdMonthlyTest: state.stripePriceIdMonthlyTest || null,
        stripePriceIdAnnualTest: state.stripePriceIdAnnualTest || null,
        stripePriceIdMonthlyLive: state.stripePriceIdMonthlyLive || null,
        stripePriceIdAnnualLive: state.stripePriceIdAnnualLive || null,
      };
      const res = await fetch(`/api/zadmin/plan-configs/${row.plan_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json() as { data: unknown; error: { message: string } | null };
      if (json.error) { setFeedback(json.error.message); return; }
      setFeedback('Saved');
      onSaved();
      setTimeout(() => setFeedback(null), 2000);
    } catch {
      setFeedback('Request failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-400 dark:text-v-dim" />
          <span className="text-sm font-semibold text-slate-800 dark:text-v-primary">{row.display_name}</span>
          <span className="text-xs text-slate-400 dark:text-v-dim font-mono">{row.plan_id}</span>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </div>
      {feedback && (
        <p className={`text-xs mb-3 ${feedback === 'Saved' ? 'text-emerald-500' : 'text-red-400'}`}>{feedback}</p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Field label="USD Monthly (cents)" value={state.priceUsdMonthlyCents} onChange={update('priceUsdMonthlyCents')} />
        <Field label="USD Annual /mo (cents)" value={state.priceUsdAnnualCents} onChange={update('priceUsdAnnualCents')} />
        <Field label="BRL Display Monthly" value={state.displayPriceBrlMonthly} onChange={update('displayPriceBrlMonthly')} />
        <Field label="BRL Display Annual" value={state.displayPriceBrlAnnual} onChange={update('displayPriceBrlAnnual')} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Stripe Price ID — Monthly (test)" value={state.stripePriceIdMonthlyTest} onChange={update('stripePriceIdMonthlyTest')} mono />
        <Field label="Stripe Price ID — Annual (test)" value={state.stripePriceIdAnnualTest} onChange={update('stripePriceIdAnnualTest')} mono />
        <Field label="Stripe Price ID — Monthly (live)" value={state.stripePriceIdMonthlyLive} onChange={update('stripePriceIdMonthlyLive')} mono />
        <Field label="Stripe Price ID — Annual (live)" value={state.stripePriceIdAnnualLive} onChange={update('stripePriceIdAnnualLive')} mono />
      </div>
    </div>
  );
}

export default function PlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<PlanConfigRow[]>([]);
  const [stripeMode, setStripeMode] = useState<'test' | 'live'>('test');
  const [loading, setLoading] = useState(true);
  const [modeUpdating, setModeUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/zadmin/plan-configs');
      const json = await res.json() as { data?: { plans: PlanConfigRow[]; stripeMode: string }; error: { message: string } | null };
      if (json.error) { setError(json.error.message); return; }
      setPlans(json.data?.plans ?? []);
      setStripeMode((json.data?.stripeMode as 'test' | 'live') ?? 'test');
    } catch {
      setError('Failed to load plan configs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleMode = async () => {
    const next = stripeMode === 'test' ? 'live' : 'test';
    setModeUpdating(true);
    try {
      const res = await fetch('/api/zadmin/stripe-mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      const json = await res.json() as { data?: { mode: string }; error: { message: string } | null };
      if (json.error) { setError(json.error.message); return; }
      setStripeMode(next);
      router.refresh();
    } catch {
      setError('Failed to update stripe mode');
    } finally {
      setModeUpdating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-v-primary tracking-tight">Planos</h1>
          <p className="text-sm text-slate-500 dark:text-v-secondary mt-1">
            Configure Stripe Price IDs, preços USD/BRL e toggle sandbox/live.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleMode}
          disabled={modeUpdating}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-dash-border bg-white dark:bg-dash-card text-sm font-medium text-slate-700 dark:text-v-primary hover:bg-slate-50 dark:hover:bg-dash-hover disabled:opacity-50 transition-colors"
        >
          {stripeMode === 'live'
            ? <ToggleRight className="w-5 h-5 text-emerald-500" />
            : <ToggleLeft className="w-5 h-5 text-amber-400" />}
          <span>
            Stripe:{' '}
            <span className={stripeMode === 'live' ? 'text-emerald-500 font-semibold' : 'text-amber-400 font-semibold'}>
              {stripeMode === 'live' ? 'Live' : 'Sandbox'}
            </span>
          </span>
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 dark:text-v-dim gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Carregando...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-4 animate-fade-in-up-1">
          {plans.map((plan) => (
            <PlanCard key={plan.plan_id} row={plan} onSaved={load} />
          ))}
        </div>
      )}
    </div>
  );
}
