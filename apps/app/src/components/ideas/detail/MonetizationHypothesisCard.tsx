'use client';

import { useState } from 'react';
import { DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionEditPanel } from './SectionEditPanel';

export interface MonetizationHypothesis {
  affiliate_angle?: string;
  product_categories?: string[];
  sponsor_category?: string;
}

export interface LegacyMonetization {
  affiliate_angle?: string;
  product_fit?: string;
  sponsor_appeal?: string;
}

interface Props {
  hypothesis?: MonetizationHypothesis;
  legacy?: LegacyMonetization;
  onSave: (payload: MonetizationHypothesis) => Promise<void>;
}

function normalize(h: MonetizationHypothesis | undefined, l: LegacyMonetization | undefined): MonetizationHypothesis {
  return {
    affiliate_angle: h?.affiliate_angle ?? l?.affiliate_angle,
    product_categories: h?.product_categories ?? (l?.product_fit ? [l.product_fit] : undefined),
    sponsor_category: h?.sponsor_category ?? l?.sponsor_appeal,
  };
}

export function MonetizationHypothesisCard({ hypothesis, legacy, onSave }: Props) {
  const normalized = normalize(hypothesis, legacy);
  const hasAny =
    !!normalized.affiliate_angle ||
    (normalized.product_categories && normalized.product_categories.length > 0) ||
    !!normalized.sponsor_category;

  if (!hasAny) return null;

  return (
    <SectionEditPanel<MonetizationHypothesis>
      title="Monetization Hypothesis"
      icon={<DollarSign className="h-3.5 w-3.5" />}
      className="border-amber-500/30 bg-amber-500/5"
      headerClassName="text-amber-400"
      onSave={onSave}
      renderIdle={() => (
        <div className="space-y-3">
          <p className="text-xs text-amber-300/70 italic">AI speculation — verify before outreach.</p>
          {normalized.affiliate_angle && <Field label="Affiliate Angle">{normalized.affiliate_angle}</Field>}
          {normalized.product_categories && normalized.product_categories.length > 0 && (
            <Field label="Product Categories">{normalized.product_categories.join(', ')}</Field>
          )}
          {normalized.sponsor_category && <Field label="Sponsor Category">{normalized.sponsor_category}</Field>}
        </div>
      )}
      renderForm={({ onSave: save, onCancel }) => (
        <MonetizationForm initial={normalized} onSave={save} onCancel={onCancel} />
      )}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function MonetizationForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: MonetizationHypothesis;
  onSave: (payload: MonetizationHypothesis) => Promise<void>;
  onCancel: () => void;
}) {
  const [affiliate, setAffiliate] = useState(initial.affiliate_angle ?? '');
  const [categories, setCategories] = useState((initial.product_categories ?? []).join(', '));
  const [sponsor, setSponsor] = useState(initial.sponsor_category ?? '');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await onSave({
        affiliate_angle: affiliate.trim() || undefined,
        product_categories: categories.split(',').map((c) => c.trim()).filter(Boolean),
        sponsor_category: sponsor.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Affiliate Angle</Label>
        <Input value={affiliate} onChange={(e) => setAffiliate(e.target.value)} disabled={saving} />
      </div>
      <div>
        <Label className="text-xs">Product Categories (comma-separated)</Label>
        <Input value={categories} onChange={(e) => setCategories(e.target.value)} disabled={saving} />
      </div>
      <div>
        <Label className="text-xs">Sponsor Category</Label>
        <Input value={sponsor} onChange={(e) => setSponsor(e.target.value)} disabled={saving} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
}
