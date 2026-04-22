'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Pencil } from 'lucide-react';

interface Props {
  value: string;
  onSave: (next: string) => Promise<void>;
  ariaLabel: string;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  displayClassName?: string;
}

export function InlineEditableText({
  value,
  onSave,
  ariaLabel,
  placeholder = 'Not set — click to add',
  multiline = false,
  className,
  displayClassName,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function commit() {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      setFlash(true);
      setTimeout(() => setFlash(false), 400);
    } catch {
      setDraft(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    const commonProps = {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
      },
      disabled: saving,
      'aria-label': ariaLabel,
      className: cn(
        'w-full rounded border border-primary/40 bg-background px-2 py-1 text-sm',
        className,
      ),
    };

    return multiline
      ? <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} rows={3} {...commonProps} />
      : <input ref={inputRef as React.RefObject<HTMLInputElement>} type="text" {...commonProps} />;
  }

  const rendered = value || (
    <span className="text-muted-foreground italic">{placeholder}</span>
  );

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        'group text-left w-full rounded px-2 py-1 -mx-2 transition-colors',
        'hover:bg-muted/40 cursor-text',
        flash && 'ring-2 ring-green-500/50',
        displayClassName,
      )}
      aria-label={`Edit ${ariaLabel}`}
    >
      <span className="flex items-start gap-1.5">
        <span className="flex-1">{rendered}</span>
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity shrink-0 mt-0.5" />
      </span>
    </button>
  );
}
