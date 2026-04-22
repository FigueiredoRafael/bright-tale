'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionEditPanel } from './SectionEditPanel';

interface Props {
  flags?: string[];
  onSave: (flags: string[]) => Promise<void>;
}

export function RiskFlagsCard({ flags, onSave }: Props) {
  if (!flags || flags.length === 0) return null;
  return (
    <SectionEditPanel<string[]>
      title="Risk Flags"
      icon={<AlertTriangle className="h-3.5 w-3.5" />}
      onSave={onSave}
      renderIdle={() => (
        <div className="flex flex-wrap gap-2">
          {flags.map((f) => (
            <Badge key={f} variant="outline" className="gap-1">
              <AlertTriangle className="h-3 w-3" />{f}
            </Badge>
          ))}
        </div>
      )}
      renderForm={({ onSave: save, onCancel }) => (
        <RiskFlagsForm initial={flags} onSave={save} onCancel={onCancel} />
      )}
    />
  );
}

function RiskFlagsForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: string[];
  onSave: (flags: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  function add() {
    const v = draft.trim();
    if (!v || items.includes(v)) return;
    setItems([...items, v]);
    setDraft('');
  }
  function remove(v: string) {
    setItems(items.filter((i) => i !== v));
  }

  async function submit() {
    setSaving(true);
    try { await onSave(items); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item} variant="outline" className="gap-1">
            {item}
            <button type="button" onClick={() => remove(item)} aria-label={`Remove ${item}`}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Add a risk flag"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          disabled={saving}
        />
        <Button variant="outline" onClick={add} disabled={saving}>Add</Button>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
}
