'use client';

import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: Option[];
  onSave: (next: string) => Promise<void>;
  ariaLabel: string;
  className?: string;
}

export function InlineEditableSelect({ value, options, onSave, ariaLabel, className }: Props) {
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [current, setCurrent] = useState(value);

  async function handleChange(next: string) {
    if (next === current) return;
    const previous = current;
    setCurrent(next);
    setSaving(true);
    try {
      await onSave(next);
      setFlash(true);
      setTimeout(() => setFlash(false), 400);
    } catch {
      setCurrent(previous);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select value={current} onValueChange={handleChange} disabled={saving}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn('h-8', flash && 'ring-2 ring-green-500/50', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
