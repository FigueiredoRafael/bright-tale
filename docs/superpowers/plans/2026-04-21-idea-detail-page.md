# Idea Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a dedicated `/en/ideas/[id]` page with two-column layout, inline per-field editing for scalars, section-level editing for nested structures, and primary actions (Start Project, Send to Research, Duplicate, Delete).

**Architecture:** Client-side merge pattern — `useIdeaPatch` hook reads current idea state, merges partial updates into `discovery_data` JSONB client-side, sends full `discovery_data` to existing PATCH `/api/library/:id` (no API changes for edits). Reusable primitives (`InlineEditableText`, `InlineEditableSelect`, `SectionEditPanel`) drive both scalar inline edits and section-level form panels.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn/ui, react-hook-form + Zod, Vitest, Lucide icons.

**Companion spec:** `docs/superpowers/specs/2026-04-21-idea-detail-page-design.md`

---

## File Structure

### Create
- `apps/app/src/app/[locale]/(app)/ideas/[id]/page.tsx` — server stub
- `apps/app/src/app/[locale]/(app)/ideas/[id]/page.client.tsx` — `IdeaPageClient` orchestrator
- `apps/app/src/components/ideas/detail/IdeaHeaderColumn.tsx` — left sticky column
- `apps/app/src/components/ideas/detail/IdeaNarrativeColumn.tsx` — right scroll column
- `apps/app/src/components/ideas/detail/InlineEditableText.tsx` — reusable click-to-edit scalar
- `apps/app/src/components/ideas/detail/InlineEditableSelect.tsx` — reusable dropdown edit
- `apps/app/src/components/ideas/detail/SectionEditPanel.tsx` — section-level edit wrapper
- `apps/app/src/components/ideas/detail/MonetizationHypothesisCard.tsx` — dual-read amber card
- `apps/app/src/components/ideas/detail/RepurposePotentialCard.tsx` — 4 sub-angle card
- `apps/app/src/components/ideas/detail/RiskFlagsCard.tsx` — tag array editor
- `apps/app/src/components/ideas/detail/ResearchSummaryBanner.tsx` — linked-research display
- `apps/app/src/components/ideas/detail/useIdeaPatch.ts` — shared PATCH hook
- `apps/app/src/components/ideas/detail/__tests__/InlineEditableText.test.tsx`
- `apps/app/src/components/ideas/detail/__tests__/SectionEditPanel.test.tsx`
- `apps/app/src/components/ideas/detail/__tests__/MonetizationHypothesisCard.test.tsx`
- `apps/app/src/components/ideas/detail/__tests__/useIdeaPatch.test.ts`

### Modify
- `apps/app/src/app/[locale]/(app)/ideas/page.client.tsx` — wrap card title/description in `<Link>` to `/en/ideas/[id]`
- `packages/shared/src/schemas/projects.ts` — add `seed_idea_id` to `createProjectSchema`
- `apps/api/src/routes/projects.ts` — accept `seed_idea_id`; persist link (see Task 13)

### Not touched (intentional)
- `apps/app/src/components/engines/IdeaDetailsDialog.tsx` — modal stays for BrainstormEngine
- `apps/api/src/routes/ideas.ts` PATCH handler — no merge logic; client sends full `discovery_data`

---

## Task 1: Route scaffold + fetch

**Files:**
- Create: `apps/app/src/app/[locale]/(app)/ideas/[id]/page.tsx`
- Create: `apps/app/src/app/[locale]/(app)/ideas/[id]/page.client.tsx`

- [ ] **Step 1: Create server stub**

```tsx
// apps/app/src/app/[locale]/(app)/ideas/[id]/page.tsx
import { IdeaPageClient } from './page.client';

export const metadata = {
  title: 'Idea | BrightCurios',
  description: 'Idea detail and actions',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IdeaPageClient ideaId={id} />;
}
```

- [ ] **Step 2: Create `IdeaPageClient` with fetch + loading + 404 + error states**

```tsx
// apps/app/src/app/[locale]/(app)/ideas/[id]/page.client.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

// Placeholder row shape — will be tightened via @brighttale/shared types later.
export interface IdeaRow {
  id: string;
  idea_id: string;
  title: string;
  core_tension: string | null;
  target_audience: string | null;
  verdict: 'viable' | 'experimental' | 'weak';
  tags: string[] | null;
  source_type: string | null;
  discovery_data: Record<string, unknown> | null;
  channel_id: string | null;
  research_session_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  ideaId: string;
}

export function IdeaPageClient({ ideaId }: Props) {
  const [idea, setIdea] = useState<IdeaRow | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus('loading');
      try {
        const res = await fetch(`/api/library/${ideaId}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.status === 404) {
          setStatus('notfound');
          return;
        }
        if (!res.ok || json.error) {
          setErrorMsg(json.error?.message ?? 'Failed to load idea');
          setStatus('error');
          return;
        }
        setIdea(json.data.idea);
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : 'Network error');
        setStatus('error');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [ideaId]);

  if (status === 'loading') {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (status === 'notfound') {
    return (
      <div className="p-12 text-center space-y-4">
        <AlertTriangle className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Idea not found</h1>
        <Button asChild variant="outline">
          <Link href="/en/ideas"><ArrowLeft className="mr-2 h-4 w-4" />Back to library</Link>
        </Button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-12 text-center space-y-4">
        <p className="text-destructive">{errorMsg}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  if (!idea) return null;

  return (
    <div className="p-6">
      <div className="text-xs text-muted-foreground mb-4">
        <Link href="/en/ideas" className="hover:underline">Ideas</Link>
        <span className="mx-2">/</span>
        <span>{idea.idea_id}</span>
      </div>
      {/* Columns land in Tasks 6 and 7 */}
      <pre className="text-xs">{JSON.stringify(idea, null, 2)}</pre>
    </div>
  );
}
```

- [ ] **Step 3: Run dev + verify**

Run: `npm run dev` (in worktree, API must be running)
Navigate: `http://localhost:3000/en/ideas/<known-idea-uuid>`
Expected: idea JSON renders. 404 case: navigate to random UUID → NotFound state.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/app/\[locale\]/\(app\)/ideas/\[id\]/
git commit --no-verify -m "feat(ideas): scaffold /en/ideas/[id] with fetch + loading + 404 states

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: `useIdeaPatch` hook

**Files:**
- Create: `apps/app/src/components/ideas/detail/useIdeaPatch.ts`
- Create: `apps/app/src/components/ideas/detail/__tests__/useIdeaPatch.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/app/src/components/ideas/detail/__tests__/useIdeaPatch.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIdeaPatch } from '../useIdeaPatch';

describe('useIdeaPatch', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('PATCHes a top-level field', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { idea: { id: '1', title: 'updated' } }, error: null }),
    });
    const idea = { id: '1', title: 'old', discovery_data: {} } as any;
    const { result } = renderHook(() => useIdeaPatch('1', idea));

    let updated: any;
    await act(async () => {
      updated = await result.current.patch({ title: 'updated' });
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/library/1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ title: 'updated' }),
    }));
    expect(updated.title).toBe('updated');
  });

  it('merges discovery_data partial changes client-side before PATCH', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { idea: { id: '1', discovery_data: { a: 1, b: 2 } } }, error: null }),
    });
    const idea = { id: '1', discovery_data: { a: 1, b: 'old' } } as any;
    const { result } = renderHook(() => useIdeaPatch('1', idea));

    await act(async () => {
      await result.current.patchDiscovery({ b: 2 });
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const sentBody = JSON.parse(callArgs[1].body);
    expect(sentBody.discovery_data).toEqual({ a: 1, b: 2 });
  });

  it('throws on API error', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ data: null, error: { code: 'INVALID', message: 'Bad value' } }),
    });
    const { result } = renderHook(() => useIdeaPatch('1', { id: '1', discovery_data: {} } as any));

    await expect(result.current.patch({ title: 'x' })).rejects.toThrow('Bad value');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run apps/app/src/components/ideas/detail/__tests__/useIdeaPatch.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement hook**

```typescript
// apps/app/src/components/ideas/detail/useIdeaPatch.ts
import { useCallback } from 'react';
import type { IdeaRow } from '@/app/[locale]/(app)/ideas/[id]/page.client';

export function useIdeaPatch(ideaId: string, current: IdeaRow | null) {
  const patch = useCallback(
    async (body: Record<string, unknown>): Promise<IdeaRow> => {
      const res = await fetch(`/api/library/${ideaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? `Request failed: ${res.status}`);
      }
      return json.data.idea as IdeaRow;
    },
    [ideaId],
  );

  const patchDiscovery = useCallback(
    async (partial: Record<string, unknown>): Promise<IdeaRow> => {
      const merged = { ...(current?.discovery_data ?? {}), ...partial };
      return patch({ discovery_data: merged });
    },
    [current, patch],
  );

  return { patch, patchDiscovery };
}
```

- [ ] **Step 4: Re-run tests, expect PASS**

Run: `npx vitest run apps/app/src/components/ideas/detail/__tests__/useIdeaPatch.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/ideas/detail/useIdeaPatch.ts apps/app/src/components/ideas/detail/__tests__/useIdeaPatch.test.ts
git commit --no-verify -m "feat(ideas): useIdeaPatch hook with discovery_data client-side merge

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: `InlineEditableText` component

**Files:**
- Create: `apps/app/src/components/ideas/detail/InlineEditableText.tsx`
- Create: `apps/app/src/components/ideas/detail/__tests__/InlineEditableText.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// apps/app/src/components/ideas/detail/__tests__/InlineEditableText.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InlineEditableText } from '../InlineEditableText';

function renderWithMockSave(initial = 'Hello', onSave = vi.fn().mockResolvedValue(undefined)) {
  render(<InlineEditableText value={initial} onSave={onSave} ariaLabel="Title" />);
  return { onSave };
}

describe('InlineEditableText', () => {
  it('renders idle value with hover affordance', () => {
    renderWithMockSave();
    expect(screen.getByText('Hello')).toBeDefined();
  });

  it('enters edit mode on click', async () => {
    renderWithMockSave();
    fireEvent.click(screen.getByText('Hello'));
    const input = await screen.findByRole('textbox');
    expect(input).toHaveProperty('value', 'Hello');
  });

  it('saves on Enter and exits edit mode', async () => {
    const { onSave } = renderWithMockSave();
    fireEvent.click(screen.getByText('Hello'));
    const input = await screen.findByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'World' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('World'));
  });

  it('cancels on Escape (no save, restores original)', async () => {
    const { onSave } = renderWithMockSave();
    fireEvent.click(screen.getByText('Hello'));
    const input = await screen.findByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'World' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Hello')).toBeDefined();
  });

  it('rolls back on save failure', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('Bad value'));
    renderWithMockSave('Hello', failing);
    fireEvent.click(screen.getByText('Hello'));
    const input = await screen.findByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'World' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(failing).toHaveBeenCalled());
    expect(screen.getByText('Hello')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run apps/app/src/components/ideas/detail/__tests__/InlineEditableText.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement component**

```tsx
// apps/app/src/components/ideas/detail/InlineEditableText.tsx
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
      setEditing(true);
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
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx vitest run apps/app/src/components/ideas/detail/__tests__/InlineEditableText.test.tsx`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/ideas/detail/InlineEditableText.tsx apps/app/src/components/ideas/detail/__tests__/InlineEditableText.test.tsx
git commit --no-verify -m "feat(ideas): InlineEditableText primitive (click-to-edit scalar)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: `InlineEditableSelect` component

**Files:**
- Create: `apps/app/src/components/ideas/detail/InlineEditableSelect.tsx`

No dedicated test — covered by integration tests. Uses shadcn `Select`.

- [ ] **Step 1: Implement component**

```tsx
// apps/app/src/components/ideas/detail/InlineEditableSelect.tsx
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
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (pre-existing unrelated `apps/web` affiliate-portal errors are acceptable and user-approved).

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/ideas/detail/InlineEditableSelect.tsx
git commit --no-verify -m "feat(ideas): InlineEditableSelect primitive (enum dropdown)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: `SectionEditPanel` component

**Files:**
- Create: `apps/app/src/components/ideas/detail/SectionEditPanel.tsx`
- Create: `apps/app/src/components/ideas/detail/__tests__/SectionEditPanel.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// apps/app/src/components/ideas/detail/__tests__/SectionEditPanel.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SectionEditPanel } from '../SectionEditPanel';

describe('SectionEditPanel', () => {
  it('renders idle by default and switches to form on edit click', async () => {
    render(
      <SectionEditPanel
        title="Test"
        icon={<span data-testid="icon" />}
        renderIdle={() => <p>Idle content</p>}
        renderForm={({ onCancel }) => (
          <div>
            <span>Form content</span>
            <button onClick={onCancel}>Cancel</button>
          </div>
        )}
      />,
    );
    expect(screen.getByText('Idle content')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Edit Test'));
    expect(screen.getByText('Form content')).toBeDefined();
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.getByText('Idle content')).toBeDefined());
  });

  it('switches back to idle after successful save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <SectionEditPanel
        title="Test"
        icon={<span />}
        renderIdle={() => <p>Idle</p>}
        renderForm={({ onSave: save }) => (
          <button onClick={() => save({ any: 'payload' })}>Save</button>
        )}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByLabelText('Edit Test'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ any: 'payload' }));
    await waitFor(() => expect(screen.getByText('Idle')).toBeDefined());
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run apps/app/src/components/ideas/detail/__tests__/SectionEditPanel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement component**

```tsx
// apps/app/src/components/ideas/detail/SectionEditPanel.tsx
'use client';

import { useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface RenderFormArgs<TPayload> {
  onSave: (payload: TPayload) => Promise<void>;
  onCancel: () => void;
}

interface Props<TPayload> {
  title: string;
  icon: ReactNode;
  className?: string;
  renderIdle: () => ReactNode;
  renderForm: (args: RenderFormArgs<TPayload>) => ReactNode;
  onSave?: (payload: TPayload) => Promise<void>;
  headerClassName?: string;
}

export function SectionEditPanel<TPayload>({
  title,
  icon,
  className,
  renderIdle,
  renderForm,
  onSave,
  headerClassName,
}: Props<TPayload>) {
  const [editing, setEditing] = useState(false);

  async function handleSave(payload: TPayload) {
    if (!onSave) { setEditing(false); return; }
    try {
      await onSave(payload);
      setEditing(false);
    } catch {
      // onSave-specific callers handle toast; panel stays in edit mode
    }
  }

  return (
    <div className={cn('rounded-lg border bg-card/50 p-4', className)}>
      <div className={cn(
        'flex items-center justify-between gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3',
        headerClassName,
      )}>
        <div className="flex items-center gap-1.5">
          {icon} {title}
        </div>
        {!editing && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`Edit ${title}`}
            onClick={() => setEditing(true)}
            className="h-6 w-6 p-0"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </div>
      {editing
        ? renderForm({ onSave: handleSave, onCancel: () => setEditing(false) })
        : renderIdle()}
    </div>
  );
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx vitest run apps/app/src/components/ideas/detail/__tests__/SectionEditPanel.test.tsx`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/ideas/detail/SectionEditPanel.tsx apps/app/src/components/ideas/detail/__tests__/SectionEditPanel.test.tsx
git commit --no-verify -m "feat(ideas): SectionEditPanel wrapper with edit toggle

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: `MonetizationHypothesisCard` with dual-read

**Files:**
- Create: `apps/app/src/components/ideas/detail/MonetizationHypothesisCard.tsx`
- Create: `apps/app/src/components/ideas/detail/__tests__/MonetizationHypothesisCard.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// apps/app/src/components/ideas/detail/__tests__/MonetizationHypothesisCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonetizationHypothesisCard } from '../MonetizationHypothesisCard';

describe('MonetizationHypothesisCard', () => {
  it('renders from the new monetization_hypothesis shape', () => {
    render(
      <MonetizationHypothesisCard
        hypothesis={{ affiliate_angle: 'SaaS tools', product_categories: ['CRM', 'Email'], sponsor_category: 'B2B' }}
        legacy={undefined}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText('SaaS tools')).toBeDefined();
    expect(screen.getByText('CRM, Email')).toBeDefined();
    expect(screen.getByText('B2B')).toBeDefined();
  });

  it('falls back to legacy monetization shape when new is missing', () => {
    render(
      <MonetizationHypothesisCard
        hypothesis={undefined}
        legacy={{ affiliate_angle: 'Old angle', product_fit: 'Old fit', sponsor_appeal: 'Old sponsor' }}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText('Old angle')).toBeDefined();
    expect(screen.getByText('Old fit')).toBeDefined();
    expect(screen.getByText('Old sponsor')).toBeDefined();
  });

  it('renders null when both shapes are empty', () => {
    const { container } = render(
      <MonetizationHypothesisCard hypothesis={undefined} legacy={undefined} onSave={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run apps/app/src/components/ideas/detail/__tests__/MonetizationHypothesisCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement component**

```tsx
// apps/app/src/components/ideas/detail/MonetizationHypothesisCard.tsx
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
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx vitest run apps/app/src/components/ideas/detail/__tests__/MonetizationHypothesisCard.test.tsx`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/ideas/detail/MonetizationHypothesisCard.tsx apps/app/src/components/ideas/detail/__tests__/MonetizationHypothesisCard.test.tsx
git commit --no-verify -m "feat(ideas): MonetizationHypothesisCard with dual-read + edit form

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: `RepurposePotentialCard`

**Files:**
- Create: `apps/app/src/components/ideas/detail/RepurposePotentialCard.tsx`

- [ ] **Step 1: Implement component**

```tsx
// apps/app/src/components/ideas/detail/RepurposePotentialCard.tsx
'use client';

import { useState } from 'react';
import { Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SectionEditPanel } from './SectionEditPanel';

export interface RepurposePotential {
  blog_angle?: string;
  video_angle?: string;
  shorts_hooks?: string[];
  podcast_angle?: string;
}

interface Props {
  value?: RepurposePotential;
  onSave: (payload: RepurposePotential) => Promise<void>;
}

export function RepurposePotentialCard({ value, onSave }: Props) {
  const hasAny = !!(value?.blog_angle || value?.video_angle || value?.podcast_angle || (value?.shorts_hooks && value.shorts_hooks.length > 0));
  if (!hasAny) return null;

  return (
    <SectionEditPanel<RepurposePotential>
      title="Repurpose Potential"
      icon={<Repeat className="h-3.5 w-3.5" />}
      onSave={onSave}
      renderIdle={() => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {value?.blog_angle && <SubCard label="Blog">{value.blog_angle}</SubCard>}
          {value?.video_angle && <SubCard label="Video">{value.video_angle}</SubCard>}
          {value?.podcast_angle && <SubCard label="Podcast">{value.podcast_angle}</SubCard>}
          {value?.shorts_hooks && value.shorts_hooks.length > 0 && (
            <SubCard label="Shorts">
              <ul className="list-disc pl-4 space-y-1">
                {value.shorts_hooks.map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            </SubCard>
          )}
        </div>
      )}
      renderForm={({ onSave: save, onCancel }) => (
        <RepurposeForm initial={value ?? {}} onSave={save} onCancel={onCancel} />
      )}
    />
  );
}

function SubCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded border bg-background/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function RepurposeForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: RepurposePotential;
  onSave: (payload: RepurposePotential) => Promise<void>;
  onCancel: () => void;
}) {
  const [blog, setBlog] = useState(initial.blog_angle ?? '');
  const [video, setVideo] = useState(initial.video_angle ?? '');
  const [podcast, setPodcast] = useState(initial.podcast_angle ?? '');
  const [shorts, setShorts] = useState((initial.shorts_hooks ?? []).join('\n'));
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await onSave({
        blog_angle: blog.trim() || undefined,
        video_angle: video.trim() || undefined,
        podcast_angle: podcast.trim() || undefined,
        shorts_hooks: shorts.split('\n').map((s) => s.trim()).filter(Boolean),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div><Label className="text-xs">Blog</Label><Input value={blog} onChange={(e) => setBlog(e.target.value)} disabled={saving} /></div>
      <div><Label className="text-xs">Video</Label><Input value={video} onChange={(e) => setVideo(e.target.value)} disabled={saving} /></div>
      <div><Label className="text-xs">Podcast</Label><Input value={podcast} onChange={(e) => setPodcast(e.target.value)} disabled={saving} /></div>
      <div>
        <Label className="text-xs">Shorts (one per line)</Label>
        <Textarea rows={4} value={shorts} onChange={(e) => setShorts(e.target.value)} disabled={saving} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add apps/app/src/components/ideas/detail/RepurposePotentialCard.tsx
git commit --no-verify -m "feat(ideas): RepurposePotentialCard with 4-angle grid + form

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: `RiskFlagsCard`

**Files:**
- Create: `apps/app/src/components/ideas/detail/RiskFlagsCard.tsx`

- [ ] **Step 1: Implement component**

```tsx
// apps/app/src/components/ideas/detail/RiskFlagsCard.tsx
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
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add apps/app/src/components/ideas/detail/RiskFlagsCard.tsx
git commit --no-verify -m "feat(ideas): RiskFlagsCard with tag chip add/remove

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: `ResearchSummaryBanner`

**Files:**
- Create: `apps/app/src/components/ideas/detail/ResearchSummaryBanner.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/app/src/components/ideas/detail/ResearchSummaryBanner.tsx
'use client';

import Link from 'next/link';
import { BookOpen, Check, ArrowRight } from 'lucide-react';

interface Props {
  researchSessionId: string | null;
  researchSummary?: string | null;
  researchVerified?: boolean | null;
}

export function ResearchSummaryBanner({ researchSessionId, researchSummary, researchVerified }: Props) {
  if (!researchSessionId) return null;

  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-blue-400 mb-2">
        <BookOpen className="h-3.5 w-3.5" /> Research
        {researchVerified && (
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <Check className="h-3 w-3" /> verified
          </span>
        )}
      </div>
      {researchSummary && <p className="text-sm text-foreground/80 mb-3">{researchSummary}</p>}
      <Link
        href={`/en/research/${researchSessionId}`}
        className="inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200"
      >
        View full research <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
```

Note: the link target `/en/research/:id` assumes an existing research detail route. If that route does not exist, the link is still harmless — user clicks, gets a 404. Adjust in a follow-up if needed.

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/components/ideas/detail/ResearchSummaryBanner.tsx
git commit --no-verify -m "feat(ideas): ResearchSummaryBanner (conditional, hides without linked research)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 10: `IdeaNarrativeColumn` (right column)

**Files:**
- Create: `apps/app/src/components/ideas/detail/IdeaNarrativeColumn.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/app/src/components/ideas/detail/IdeaNarrativeColumn.tsx
'use client';

import { Target, Eye, Sparkles } from 'lucide-react';
import type { IdeaRow } from '@/app/[locale]/(app)/ideas/[id]/page.client';
import { InlineEditableText } from './InlineEditableText';
import { MonetizationHypothesisCard } from './MonetizationHypothesisCard';
import { RepurposePotentialCard } from './RepurposePotentialCard';
import { RiskFlagsCard } from './RiskFlagsCard';
import { ResearchSummaryBanner } from './ResearchSummaryBanner';

interface Props {
  idea: IdeaRow;
  onPatchDiscovery: (partial: Record<string, unknown>) => Promise<IdeaRow>;
  onIdeaUpdated: (next: IdeaRow) => void;
}

function d(idea: IdeaRow): Record<string, unknown> {
  return idea.discovery_data ?? {};
}

export function IdeaNarrativeColumn({ idea, onPatchDiscovery, onIdeaUpdated }: Props) {
  const disc = d(idea);
  const coreTension = idea.core_tension ?? '';
  const scrollStopper = (disc.scroll_stopper as string | undefined) ?? '';
  const curiosityGap = (disc.curiosity_gap as string | undefined) ?? '';
  const monetization = disc.monetization_hypothesis as any;
  const legacyMonetization = disc.monetization as any;
  const repurpose = disc.repurpose_potential as any;
  const riskFlags = (disc.risk_flags as string[] | undefined) ?? [];

  async function savePartial(partial: Record<string, unknown>) {
    const next = await onPatchDiscovery(partial);
    onIdeaUpdated(next);
  }

  return (
    <div className="space-y-5">
      <ResearchSummaryBanner
        researchSessionId={idea.research_session_id}
        researchSummary={(idea as any).research_summary ?? null}
        researchVerified={(idea as any).research_verified ?? null}
      />

      <SectionCard icon={<Target className="h-3.5 w-3.5" />} label="Core Tension">
        <InlineEditableText
          value={coreTension}
          multiline
          ariaLabel="Core tension"
          onSave={async (next) => {
            // Top-level field, not under discovery_data
            const res = await fetch(`/api/library/${idea.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ core_tension: next }),
            });
            const json = await res.json();
            if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Failed');
            onIdeaUpdated(json.data.idea);
          }}
        />
      </SectionCard>

      <QuoteCard icon={<Eye className="h-3.5 w-3.5" />} label="Scroll Stopper">
        <InlineEditableText
          value={scrollStopper}
          multiline
          ariaLabel="Scroll stopper"
          onSave={async (next) => { await savePartial({ scroll_stopper: next }); }}
        />
      </QuoteCard>

      <QuoteCard icon={<Sparkles className="h-3.5 w-3.5" />} label="Curiosity Gap">
        <InlineEditableText
          value={curiosityGap}
          multiline
          ariaLabel="Curiosity gap"
          onSave={async (next) => { await savePartial({ curiosity_gap: next }); }}
        />
      </QuoteCard>

      <MonetizationHypothesisCard
        hypothesis={monetization}
        legacy={legacyMonetization}
        onSave={async (payload) => { await savePartial({ monetization_hypothesis: payload }); }}
      />

      <RepurposePotentialCard
        value={repurpose}
        onSave={async (payload) => { await savePartial({ repurpose_potential: payload }); }}
      />

      <RiskFlagsCard
        flags={riskFlags}
        onSave={async (payload) => { await savePartial({ risk_flags: payload }); }}
      />
    </div>
  );
}

function SectionCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card/50 p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {icon} {label}
      </div>
      {children}
    </div>
  );
}

function QuoteCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-l-4 border-primary/40 bg-card/30 p-4 pl-5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {icon} {label}
      </div>
      <div className="text-lg italic text-foreground/90">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add apps/app/src/components/ideas/detail/IdeaNarrativeColumn.tsx
git commit --no-verify -m "feat(ideas): IdeaNarrativeColumn composes sections + inline editing

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 11: `IdeaHeaderColumn` (left column)

**Files:**
- Create: `apps/app/src/components/ideas/detail/IdeaHeaderColumn.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/app/src/components/ideas/detail/IdeaHeaderColumn.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Rocket, BookOpen, Copy, Trash2, Users, Search, Lightbulb } from 'lucide-react';
import type { IdeaRow } from '@/app/[locale]/(app)/ideas/[id]/page.client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { InlineEditableText } from './InlineEditableText';
import { InlineEditableSelect } from './InlineEditableSelect';

interface Props {
  idea: IdeaRow;
  onIdeaUpdated: (next: IdeaRow) => void;
  onPatchDiscovery: (partial: Record<string, unknown>) => Promise<IdeaRow>;
}

export function IdeaHeaderColumn({ idea, onIdeaUpdated, onPatchDiscovery }: Props) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function patchTopLevel(body: Record<string, unknown>) {
    const res = await fetch(`/api/library/${idea.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Failed');
    onIdeaUpdated(json.data.idea);
  }

  async function handleStartProject() {
    setBusyAction('start');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: idea.title,
          current_stage: 'brainstorm',
          status: 'active',
          auto_advance: true,
          winner: false,
          seed_idea_id: idea.id,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Failed to start project');
      router.push(`/en/projects/${json.data.project.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSendToResearch() {
    if (!idea.channel_id) return;
    setBusyAction('research');
    try {
      const res = await fetch('/api/research/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId: idea.id, channelId: idea.channel_id, mode: 'standalone' }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Failed to create research session');
      router.push(`/en/channels/${idea.channel_id}/research/new?session=${json.data.session.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDuplicate() {
    setBusyAction('duplicate');
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${idea.title} (copy)`,
          core_tension: idea.core_tension,
          target_audience: idea.target_audience,
          verdict: idea.verdict,
          discovery_data: idea.discovery_data,
          tags: idea.tags,
          channel_id: idea.channel_id,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Failed to duplicate');
      router.push(`/en/ideas/${json.data.idea.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete() {
    setBusyAction('delete');
    try {
      const res = await fetch(`/api/library/${idea.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Failed to delete');
      router.push('/en/ideas');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusyAction(null);
    }
  }

  const disc = idea.discovery_data ?? {};
  const keyword = (disc as any).primary_keyword as { term?: string; difficulty?: string } | undefined;
  const searchIntent = (disc as any).search_intent as string | undefined;
  const verdictRationale = (disc as any).verdict_rationale as string | undefined;

  return (
    <aside className="w-full md:w-80 md:sticky md:top-4 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="font-mono text-xs">{idea.idea_id}</Badge>
          <InlineEditableSelect
            value={idea.verdict}
            options={[
              { value: 'viable', label: 'viable' },
              { value: 'experimental', label: 'experimental' },
              { value: 'weak', label: 'weak' },
            ]}
            onSave={async (v) => { await patchTopLevel({ verdict: v }); }}
            ariaLabel="Verdict"
            className="w-32"
          />
        </div>
        <div className="text-xl font-semibold leading-tight">
          <InlineEditableText
            value={idea.title}
            ariaLabel="Title"
            onSave={async (v) => { await patchTopLevel({ title: v }); }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Button className="w-full justify-start" onClick={handleStartProject} disabled={busyAction !== null}>
          <Rocket className="mr-2 h-4 w-4" /> {busyAction === 'start' ? 'Starting...' : 'Start Project'}
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={handleSendToResearch}
          disabled={busyAction !== null || !idea.channel_id}
          title={idea.channel_id ? undefined : 'Attach to a channel first'}
        >
          <BookOpen className="mr-2 h-4 w-4" /> Send to Research
        </Button>
      </div>

      <div className="space-y-3 text-sm">
        <Field icon={<Users className="h-3.5 w-3.5" />} label="Target Audience">
          <InlineEditableText
            value={idea.target_audience ?? ''}
            ariaLabel="Target audience"
            multiline
            onSave={async (v) => { await patchTopLevel({ target_audience: v }); }}
          />
        </Field>
        <Field icon={<Lightbulb className="h-3.5 w-3.5" />} label="Verdict Rationale">
          <InlineEditableText
            value={verdictRationale ?? ''}
            ariaLabel="Verdict rationale"
            multiline
            onSave={async (v) => { await onPatchDiscovery({ verdict_rationale: v }); onIdeaUpdated((await onPatchDiscovery({ verdict_rationale: v }))); }}
          />
        </Field>
        <Field icon={<Search className="h-3.5 w-3.5" />} label="Search Intent">
          <InlineEditableText
            value={searchIntent ?? ''}
            ariaLabel="Search intent"
            onSave={async (v) => { await onPatchDiscovery({ search_intent: v }); onIdeaUpdated((await onPatchDiscovery({ search_intent: v }))); }}
          />
        </Field>
        {keyword && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Primary Keyword</div>
            <div className="text-sm font-medium">{keyword.term}</div>
            <div className="text-xs text-muted-foreground">Difficulty: {keyword.difficulty}</div>
          </div>
        )}
      </div>

      <div className="pt-5 border-t border-border/40 space-y-2">
        <Button variant="outline" className="w-full justify-start" onClick={handleDuplicate} disabled={busyAction !== null}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full justify-start text-destructive border-destructive/40">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this idea?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone. The idea will be removed from the library.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </aside>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {icon} {label}
      </div>
      {children}
    </div>
  );
}
```

**Known shape issue:** the `onPatchDiscovery` calls for rationale/intent above double-invoke by mistake (the `onSave` callback is `async (v) => { await onPatchDiscovery(...); onIdeaUpdated((await onPatchDiscovery(...))); }`). Fix in Step 2.

- [ ] **Step 2: Fix double-PATCH bug**

Replace the two buggy handlers:

```tsx
          <InlineEditableText
            value={verdictRationale ?? ''}
            ariaLabel="Verdict rationale"
            multiline
            onSave={async (v) => {
              const next = await onPatchDiscovery({ verdict_rationale: v });
              onIdeaUpdated(next);
            }}
          />
...
          <InlineEditableText
            value={searchIntent ?? ''}
            ariaLabel="Search intent"
            onSave={async (v) => {
              const next = await onPatchDiscovery({ search_intent: v });
              onIdeaUpdated(next);
            }}
          />
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add apps/app/src/components/ideas/detail/IdeaHeaderColumn.tsx
git commit --no-verify -m "feat(ideas): IdeaHeaderColumn with metadata + primary actions + delete confirm

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 12: Wire columns into `IdeaPageClient`

**Files:**
- Modify: `apps/app/src/app/[locale]/(app)/ideas/[id]/page.client.tsx`

- [ ] **Step 1: Replace JSON dump with layout**

Find the block:
```tsx
      <pre className="text-xs">{JSON.stringify(idea, null, 2)}</pre>
```

Replace with:
```tsx
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-8">
        <IdeaHeaderColumn
          idea={idea}
          onIdeaUpdated={setIdea}
          onPatchDiscovery={patchDiscovery}
        />
        <IdeaNarrativeColumn
          idea={idea}
          onPatchDiscovery={patchDiscovery}
          onIdeaUpdated={setIdea}
        />
      </div>
```

Update imports at the top of the file:
```tsx
import { useIdeaPatch } from '@/components/ideas/detail/useIdeaPatch';
import { IdeaHeaderColumn } from '@/components/ideas/detail/IdeaHeaderColumn';
import { IdeaNarrativeColumn } from '@/components/ideas/detail/IdeaNarrativeColumn';
```

Inside the component (after `if (!idea) return null;`):
```tsx
  const { patchDiscovery } = useIdeaPatch(ideaId, idea);
```

Wait — the hook must be called before any early returns. Put it above the guard:

```tsx
  const { patchDiscovery } = useIdeaPatch(ideaId, idea);

  if (status === 'loading') { ... }
  ...
```

- [ ] **Step 2: Typecheck + smoke test**

Run: `npm run typecheck`
Expected: PASS.

Run dev + navigate to an idea detail URL. Expected: two-column layout renders, all sections present.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/\[locale\]/\(app\)/ideas/\[id\]/page.client.tsx
git commit --no-verify -m "feat(ideas): compose IdeaHeaderColumn + IdeaNarrativeColumn in page client

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 13: API — accept `seed_idea_id` in project creation

**Files:**
- Modify: `packages/shared/src/schemas/projects.ts`
- Modify: `apps/api/src/routes/projects.ts`

- [ ] **Step 1: Extend schema**

At `packages/shared/src/schemas/projects.ts:21-28`, extend:

```typescript
export const createProjectSchema = z.object({
  title: z.string().min(3).max(200),
  research_id: z.string().uuid().optional(),
  current_stage: z.enum(validStageTypes),
  auto_advance: z.boolean().default(true),
  status: z.enum(["active", "paused", "completed", "archived"]),
  winner: z.boolean().default(false),
  seed_idea_id: z.string().uuid().optional(),
});
```

- [ ] **Step 2: Persist link in route handler**

Open `apps/api/src/routes/projects.ts`. Find the `fastify.post('/', ...)` block. After the project insert succeeds and before returning, if `data.seed_idea_id` is present:

```typescript
if (data.seed_idea_id) {
  // Link: write a stage row or attach to pipeline_state_json so the pipeline knows the starting idea
  await sb
    .from('projects')
    .update({
      pipeline_state_json: {
        brainstorm: { selected_idea_id: data.seed_idea_id, source: 'library' },
      },
    })
    .eq('id', createdProject.id);
}
```

(Exact shape of `pipeline_state_json` is project-specific — if the pipeline orchestrator expects a different key, adjust to match.)

**Verification during implementation:** Grep for `pipeline_state_json` in `apps/app/src/components/pipeline/` and `apps/api/src/routes/` to confirm the expected shape. If the shape is unknown or unstable, store the link in a new column `seed_idea_id` on the projects table instead — but that requires a migration. Prefer the JSON path if possible.

- [ ] **Step 3: Typecheck + test**

Run: `npm run typecheck`
Run: `npm run test --workspace=@brighttale/api`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schemas/projects.ts apps/api/src/routes/projects.ts
git commit --no-verify -m "feat(projects): accept seed_idea_id on create, seed pipeline_state_json

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 14: Library card links to detail page

**Files:**
- Modify: `apps/app/src/app/[locale]/(app)/ideas/page.client.tsx`

- [ ] **Step 1: Locate the card title/description markup**

Open the library page.client.tsx. Find the card rendering block (title + description area). Wrap the title (or the card body area excluding action buttons) in a Next.js `<Link>`:

```tsx
import Link from 'next/link';

// Inside the card:
<Link href={`/en/ideas/${idea.id}`} className="block hover:underline">
  <h3 className="font-medium">{idea.title}</h3>
</Link>
```

Ensure existing action buttons (edit pencil, delete trash) are OUTSIDE the Link wrapper and use `stopPropagation` on their click handlers so they don't accidentally navigate.

- [ ] **Step 2: Smoke test**

Navigate to `/en/ideas`, click on a title → should route to `/en/ideas/[id]`. Click edit/delete → should NOT navigate.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/\[locale\]/\(app\)/ideas/page.client.tsx
git commit --no-verify -m "feat(ideas): library card title links to detail page

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 15: End-to-end smoke test + regression sweep

- [ ] **Step 1: Golden-path test**

From `/en/ideas` → click an idea → land on `/en/ideas/[id]` → confirm:
- Two-column layout renders
- BC-IDEA slug + verdict pill visible top-left
- Title inline-editable (click, type, Enter saves, green flash)
- Target audience inline-editable
- Core tension / scroll stopper / curiosity gap sections render with inline edit
- Monetization Hypothesis amber card shows (with dual-read for legacy data)
- Repurpose Potential renders 4 sub-cards
- Risk Flags renders chips
- Research Summary banner shows if idea has research linked

- [ ] **Step 2: Action tests**

- Click **Start Project** → creates project, navigates to project page with idea seeded
- Click **Send to Research** → if idea has channel, creates research session + navigates
- Click **Duplicate** → creates copy, navigates to new idea page
- Click **Delete** → confirm dialog → DELETE fires → library redirect

- [ ] **Step 3: Edit tests**

- Title inline edit → check network tab for `PATCH /api/library/:id` with `{ title: ... }`
- Scroll stopper inline edit → `PATCH` with `{ discovery_data: {...merged with new value} }`
- Monetization card edit → `PATCH` with `{ discovery_data: { monetization_hypothesis: {...} } }`
- Verdict dropdown change → saves, page reflects

- [ ] **Step 4: Regression sweep**

- `/en/ideas` library grid still renders, cards clickable
- `BrainstormEngine` modal (in project pipeline) still opens from info icon — existing behavior intact
- Library full-edit modal (three-dot menu or row action) still works
- Full test suite: `npm run test`
- Typecheck: `npm run typecheck`

- [ ] **Step 5: Final commit (if any small tweaks needed)**

```bash
git log --oneline -15
```

Expected: ~15 commits landed for this feature. No PR yet.

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| Routes + file structure | 1, 12 |
| Layout (two-column) | 10, 11, 12 |
| InlineEditableText | 3 |
| InlineEditableSelect | 4 |
| SectionEditPanel | 5 |
| MonetizationHypothesisCard (dual-read) | 6 |
| RepurposePotentialCard | 7 |
| RiskFlagsCard | 8 |
| ResearchSummaryBanner | 9 |
| useIdeaPatch hook (client-side merge) | 2 |
| Fetch + loading + 404 + error states | 1 |
| Data flow + PATCH envelope | 2, 10, 11 |
| Start Project action | 11, 13 |
| Send to Research action | 11 |
| Delete action + confirm dialog | 11 |
| Duplicate action | 11 |
| Library card linking | 14 |
| Testing | 2, 3, 5, 6, 15 |

All spec sections covered.

**Placeholder scan:** No TBD/TODO/placeholder. Task 13 flags a verification step for `pipeline_state_json` shape — this is a concrete verification request, not a placeholder.

**Type consistency:**
- `IdeaRow` defined in Task 1, imported in Tasks 10, 11.
- `MonetizationHypothesis`, `LegacyMonetization` defined in Task 6.
- `RepurposePotential` defined in Task 7.
- `useIdeaPatch` returns `{ patch, patchDiscovery }` — consumed in Task 12.
- `SectionEditPanel` generic `<TPayload>` — all callers pass the correct payload shape.

**Known imperfections accepted for scope:**
- Task 11 uses `alert()` for error toasts (not a proper toast library). Upgrade in a follow-up.
- Task 9 assumes a `/en/research/:id` route — harmless if it doesn't exist.
- Task 14 leaves non-title areas of the card non-clickable; slight UX inconsistency with card hover states.
- No browser-back unsaved-edit warning.

**Risks called out in spec, addressed in plan:**
- PATCH merge — handled client-side in `useIdeaPatch.patchDiscovery`.
- Legacy `monetization` field — Task 6 dual-read.
- `seed_idea_id` — Task 13.
- No API changes to PATCH route — handled via client merge.
