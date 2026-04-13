'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

export const NICHE_PRESETS = [
  'Tecnologia',
  'Finanças',
  'Produtividade',
  'Saúde / Fitness',
  'Psicologia',
  'Curiosidades',
  'Automação',
  'Empreendedorismo',
  'Educação',
  'Entretenimento',
];

interface NichePickerProps {
  value: string;
  onChange: (niche: string) => void;
  className?: string;
}

/**
 * Niche picker with preset options + custom input.
 * - Click a preset → selects it (deselects others)
 * - Type in input → overrides preset selection with custom value
 */
export function NichePicker({ value, onChange, className }: NichePickerProps) {
  const isPreset = NICHE_PRESETS.includes(value);
  const [custom, setCustom] = useState(isPreset ? '' : value);

  // Keep custom input in sync if value changes externally
  useEffect(() => {
    if (!NICHE_PRESETS.includes(value)) {
      setCustom(value);
    } else {
      setCustom('');
    }
  }, [value]);

  function selectPreset(p: string) {
    setCustom('');
    onChange(p);
  }

  function updateCustom(v: string) {
    setCustom(v);
    onChange(v);
  }

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <div className="flex flex-wrap gap-1.5">
        {NICHE_PRESETS.map((p) => {
          const selected = value === p;
          return (
            <Badge
              key={p}
              variant={selected ? 'default' : 'outline'}
              className="cursor-pointer text-xs py-1 px-2.5 hover:bg-primary/10"
              onClick={() => selectPreset(p)}
            >
              {p}
            </Badge>
          );
        })}
      </div>
      <Input
        placeholder="Ou digite outro nicho..."
        value={custom}
        onChange={(e) => updateCustom(e.target.value)}
        className="text-sm"
      />
    </div>
  );
}
