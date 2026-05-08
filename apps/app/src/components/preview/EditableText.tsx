'use client';

import { createElement, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Pencil } from 'lucide-react';

interface EditableTextProps {
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Inline element to render the static (non-editing) view. Defaults to span/p. */
  as?: 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3';
  /** Tailwind classes applied to the static view */
  staticClassName?: string;
  /** Tailwind classes applied to the editing input/textarea */
  inputClassName?: string;
  /** Maximum height before textarea scrolls (px). Default: auto-grow without cap */
  maxHeight?: number;
  /** Show pencil icon on hover hint */
  showHint?: boolean;
  /** Aria label for accessibility */
  ariaLabel?: string;
}

export function EditableText({
  value,
  onChange,
  multiline = false,
  placeholder = 'Click to edit…',
  className = '',
  disabled = false,
  as = 'span',
  staticClassName = '',
  inputClassName = '',
  maxHeight,
  showHint = true,
  ariaLabel,
}: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Seed draft from current value at edit start. We don't sync external value
  // updates while idle — when the user clicks to edit, beginEditing() reads
  // value and primes draft. Avoids the setState-in-effect anti-pattern.
  function beginEditing() {
    setDraft(value);
    setEditing(true);
  }

  // Focus + select on enter editing.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      // For textareas, place cursor at end; for single-line inputs, select all.
      if (multiline) {
        const len = (inputRef.current as HTMLTextAreaElement).value.length;
        (inputRef.current as HTMLTextAreaElement).setSelectionRange(len, len);
      } else {
        (inputRef.current as HTMLInputElement).select();
      }
    }
  }, [editing, multiline]);

  // Auto-grow textarea
  useEffect(() => {
    if (!editing || !multiline || !inputRef.current) return;
    const el = inputRef.current as HTMLTextAreaElement;
    el.style.height = 'auto';
    const next = maxHeight ? Math.min(el.scrollHeight, maxHeight) : el.scrollHeight;
    el.style.height = `${next}px`;
  }, [draft, editing, multiline, maxHeight]);

  function commit() {
    setEditing(false);
    if (draft !== value) onChange(draft);
  }

  function cancel() {
    setEditing(false);
    setDraft(value);
  }

  if (disabled) {
    return createElement(
      as,
      { className: `${staticClassName} ${className}` },
      value || placeholder,
    );
  }

  if (editing) {
    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          aria-label={ariaLabel}
          placeholder={placeholder}
          className={`w-full resize-none rounded-md border border-primary/40 bg-background px-2 py-1.5 text-sm leading-relaxed outline-none ring-2 ring-primary/20 focus:ring-primary/40 ${inputClassName} ${className}`}
          style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
        />
      );
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={`w-full rounded-md border border-primary/40 bg-background px-2 py-1 outline-none ring-2 ring-primary/20 focus:ring-primary/40 ${inputClassName} ${className}`}
      />
    );
  }

  const displayValue = value || '';
  return createElement(
    as,
    {
      role: 'button',
      tabIndex: 0,
      onClick: beginEditing,
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          beginEditing();
        }
      },
      title: 'Click to edit',
      className: `group relative cursor-text rounded-sm transition-colors hover:bg-muted/40 focus:bg-muted/40 focus:outline-none ${staticClassName} ${className}`,
    },
    displayValue || (
      <span className="text-muted-foreground italic">{placeholder}</span>
    ),
    showHint ? (
      <Pencil
        key="hint"
        aria-hidden
        className="pointer-events-none absolute right-1 top-1 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50"
      />
    ) : null,
  );
}
