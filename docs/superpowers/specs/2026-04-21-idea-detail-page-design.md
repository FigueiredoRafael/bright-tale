# Idea Detail Page — Design Spec

**Date:** 2026-04-21
**Status:** draft
**Branch:** `feat/agent-fleet-8.5` (shares branch with ongoing agent rename work; depends on `monetization_hypothesis` type)

---

## Problem

`/en/ideas` library shows idea cards with title, verdict, and a truncated core tension. Clicking the info icon opens `IdeaDetailsDialog` **only from `BrainstormEngine`** (project pipeline) — the library page has no way to view an idea's full detail. Users cannot deeply review, edit, or act on an idea without leaving the library and navigating into a project.

Goal: a dedicated `/en/ideas/[id]` page that:
1. Displays all idea fields in a two-column layout
2. Allows inline editing (scalars) and section-level editing (nested objects, arrays)
3. Provides primary actions ("Start Project", "Send to Research", Duplicate, Delete)
4. Coexists with the `BrainstormEngine` modal (which stays for fast in-pipeline preview)

## Non-Goals

- Version history / undo stack
- Real-time collaboration (last-write-wins)
- Bulk actions from this page (stay in library)
- Idea templates
- Replacing the `BrainstormEngine` modal

---

## User Flow

1. User on `/en/ideas` clicks an idea card's title or description → navigates to `/en/ideas/[id]`
2. Page loads with idea data in two-column layout
3. User reads narrative sections on the right, acts on metadata on the left
4. Inline edits scalars (hover → click → type → Enter/blur saves)
5. Section-level edits complex structures (click pencil → form → Save)
6. Primary CTA: "Start Project" seeds a new project with this idea and navigates
7. Secondary CTA: "Send to Research" creates a research session and navigates
8. Destructive: Duplicate → new idea page. Delete → back to library

---

## Routes + File Structure

```
apps/app/src/app/[locale]/(app)/ideas/[id]/
├── page.tsx          # server component stub
└── page.client.tsx   # IdeaPageClient orchestrator
```

Supporting components under `apps/app/src/components/ideas/detail/`:
- `IdeaHeaderColumn.tsx` — left column (sticky metadata + actions)
- `IdeaNarrativeColumn.tsx` — right column (section cards)
- `InlineEditableText.tsx` — reusable click-to-edit scalar (input or textarea variant)
- `InlineEditableSelect.tsx` — reusable dropdown (verdict, keyword difficulty)
- `SectionEditPanel.tsx` — wrapper for section-level edit forms
- `MonetizationHypothesisCard.tsx` — amber-themed section with dual-read for legacy
- `RepurposePotentialCard.tsx` — 4 sub-cards (blog/video/shorts/podcast)
- `RiskFlagsCard.tsx` — tag array editor
- `ResearchSummaryBanner.tsx` — linked-research display (if present)

Each file stays under 250 lines. Files that would exceed get split.

**URL param:** `[id]` is the DB row UUID. The legacy slug `BC-IDEA-xxx` displays in header but is not the URL key (UUIDs are stable; slugs can collide).

**404 handling:** If `GET /api/library/:id` returns 404, render `NotFound` component with link back to `/en/ideas`.

---

## Layout

CSS grid: `grid-cols-[320px_1fr]` on `md+`, single column below.

### Left column (sticky, 320px)

- Header row: `BC-IDEA-xxx` badge + verdict pill (viable/experimental/weak) + status (researched/drafted/published — read-only, derived from linked rows)
- Title — `InlineEditableText` (single-line, large)
- Primary actions (vertical full-width):
  - **Start Project** (primary, green accent)
  - **Send to Research** (secondary, ghost)
  - **Edit Full** (tertiary — opens existing library edit modal; fallback for users who prefer form-over-inline)
- Metadata block:
  - Target audience — `InlineEditableText`
  - Primary keyword (term + difficulty inline pair)
  - Search intent — `InlineEditableText`
  - Verdict — `InlineEditableSelect`
  - Verdict rationale — `InlineEditableText` (textarea variant)
  - Read-only: tags, source_type, created_at
- Destructive actions (bottom):
  - Duplicate (outline button, `Copy` icon)
  - Delete (outline destructive, confirm dialog)

### Right column (scrollable)

- Core Tension — `InlineEditableText` (textarea, callout card)
- Scroll Stopper — `InlineEditableText` (textarea, quote-styled)
- Curiosity Gap — `InlineEditableText` (textarea, quote-styled)
- **Monetization Hypothesis** — `SectionEditPanel` wrapping `MonetizationHypothesisCard`
  - Amber dark theme (per `e85c7dd`)
  - Dual-read legacy `monetization` shape — maps `product_fit` → `product_categories[0]`, `sponsor_appeal` → `sponsor_category`
  - Save path always writes `monetization_hypothesis` (new shape)
- **Repurpose Potential** — `SectionEditPanel` wrapping `RepurposePotentialCard`
  - 4 sub-sections: blog_angle, video_angle, shorts_hooks (array), podcast_angle
- **Risk Flags** — `SectionEditPanel` wrapping `RiskFlagsCard`
  - Tag array with add/remove chips
- **Research Summary** — `ResearchSummaryBanner` (conditional, hides if no linked research)

---

## Inline Edit UX

### `InlineEditableText` behavior

| State | Display | Interaction |
|-------|---------|-------------|
| Idle | Rendered value + hover affordance (`hover:bg-muted/30`, `cursor-text`, subtle pencil icon on hover) | Click → editing |
| Editing | `<input>` or `<textarea>` autofocused with current value | Esc = cancel · Enter (or Ctrl+Enter for textarea) = save · Blur = save |
| Saving | Disabled field, subtle spinner | Wait for PATCH |
| Saved (flash) | `ring-green-500/50` 400ms | Auto-transitions to idle |
| Error | Toast + restore editing state | User retries or Esc |

### Save flow

1. **Optimistic:** local state updates immediately on Enter/blur
2. PATCH `/api/library/:id` with partial body `{ [field]: newValue }`
3. On error: rollback to previous value, toast `"Couldn't save: {error.message}"`, re-enter editing state
4. On success: replace local `idea` with PATCH response (server is source of truth for `updated_at`), brief green flash

### `SectionEditPanel` behavior

Idle: section renders normally + pencil icon button top-right of card.

Click pencil → body swaps to a form (react-hook-form + Zod). Form shape matches section (e.g., `monetization_hypothesis` has three fields; `risk_flags` has an array editor with chip add/remove).

Footer: Save (primary), Cancel (ghost). Save submits full section payload via one PATCH. Cancel discards and returns to idle. No optimistic update — single round-trip, then swap back.

### Validation

- Type-level only (strings free-form, enums validated via `InlineEditableSelect`)
- No character limits inline; server rejects over-long values with 400 → toast
- `verdict` enum limited to `viable | experimental | weak`
- `primary_keyword.difficulty` enum limited to `low | medium | high`

### Conflict resolution

Last-write-wins. No debouncing (click-to-save, not keystroke-save). No dirty-state warning on navigation away.

---

## Data Flow + API

All routes use the project's `{ data, error }` envelope.

### Fetch on mount
```
GET /api/library/:id
→ 200 { data: IdeaRow, error: null }
→ 404 { data: null, error: { code: 'NOT_FOUND' } } → render NotFound
→ 500 { data: null, error: { code: 'INTERNAL' } } → inline retry banner
```

### Partial update (inline + section)
```
PATCH /api/library/:id
body: { [field]: newValue }          # inline
body: { monetization_hypothesis: {...} }  # section
→ 200 { data: IdeaRow, error: null }
→ 400 { data: null, error: { code, message } } → toast + rollback
```

### Start Project
```
POST /api/projects
body: { title: idea.title, seed_idea_id: idea.id }
→ navigate to /en/projects/[newId]
```
**Verification in implementation:** confirm endpoint accepts `seed_idea_id`. If not, add it or use existing pipeline init path.

### Send to Research
```
POST /api/research/sessions
body: { idea_id: idea.id, mode: 'standalone', channel_id: idea.channel_id }
→ navigate to /en/channels/[channelId]/research/new?session=[newId]
```
**Edge case:** if `idea.channel_id` is null, button disabled with tooltip "Attach to a channel first."

### Delete
```
confirm dialog
DELETE /api/library/:id
→ navigate back to /en/ideas + toast "Idea deleted"
```

### Duplicate
```
POST /api/library
body: { ...idea, title: idea.title + ' (copy)', id: undefined, idea_id: undefined }
→ navigate to /en/ideas/[newId]
```

### Research linkage display

No new endpoint. `GET /api/library/:id` response should include `research_session_id`, `research_summary`, `research_verified` when linked. **Verification in implementation:** if current route projection omits these, extend it.

---

## Component Contracts

### `InlineEditableText`
```typescript
interface Props {
  value: string;
  field: string;                                // PATCH key
  ideaId: string;
  multiline?: boolean;
  placeholder?: string;                          // for empty-state rendering
  onSaved?: (updated: IdeaRow) => void;         // bubbles updated row up
  validate?: (v: string) => string | null;      // optional client-side validation, returns error message
}
```

### `InlineEditableSelect`
```typescript
interface Props {
  value: string;
  field: string;
  ideaId: string;
  options: Array<{ value: string; label: string }>;
  onSaved?: (updated: IdeaRow) => void;
}
```

### `SectionEditPanel`
```typescript
interface Props<TPayload> {
  title: string;
  icon: ReactNode;
  className?: string;                           // card-level theming (e.g., amber for monetization)
  isEmpty: boolean;                              // hides idle render if no data
  renderIdle: () => ReactNode;
  renderForm: (props: {
    onSave: (payload: TPayload) => Promise<void>;
    onCancel: () => void;
  }) => ReactNode;
}
```

### `IdeaPageClient`
```typescript
interface Props {
  ideaId: string;
}
```
Internal state:
- `idea: IdeaRow | null`
- `loading: boolean`
- `error: ApiError | null`

Provides `useIdeaPatch(ideaId)` hook to children so they don't each own PATCH logic.

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Legacy `monetization` field (pre-rename idea) | Dual-read: display values; first section-level save writes `monetization_hypothesis` shape and leaves legacy untouched (server-side can clean later or keep both) |
| Orphan idea (no channel) | "Send to Research" disabled with tooltip. Start Project still works (project inherits null channel or shows channel picker) |
| Concurrent edits in two tabs | Last-write-wins. No conflict UI |
| Empty optional sections | Placeholder "Not set — click to add" — behaves as empty inline-edit target |
| Very long strings | Textarea auto-grows up to `max-h-96`, then internal scroll |
| Unsaved inline edit when navigating away | Discards, no warning |
| PATCH 400 (e.g., invalid verdict enum) | Toast with `error.message`, rollback, field re-enters editing |
| Research linkage absent | `ResearchSummaryBanner` hides entirely (no empty state) |
| Delete confirm → cancel | No state change |
| Delete → 500 | Toast, stay on page |

---

## Testing

### Unit (Vitest, `__tests__/` colocated)

- `InlineEditableText.test.tsx` — idle→edit→save, edit→escape→idle, edit→blur→save, optimistic rollback on rejected promise
- `InlineEditableSelect.test.tsx` — enum validation, dropdown change → PATCH
- `SectionEditPanel.test.tsx` — form dirty state, cancel discards, save submits full payload, error rollback
- `MonetizationHypothesisCard.test.tsx` — dual-read legacy shape, save writes new shape only

### Integration / smoke (manual + where automated feasible)

- Navigate `/en/ideas` card link → `/en/ideas/[id]` renders all sections
- Inline edit title → PATCH fires → local state updated → green flash
- Section edit monetization_hypothesis → PATCH with nested payload → card re-renders amber
- "Start Project" creates project + navigates
- "Send to Research" creates session + navigates; disabled with tooltip if no channel
- Delete flow confirms → DELETE fires → library redirect + toast
- Duplicate → new idea page loads with `(copy)` suffix title

### Regression

- `/en/ideas` library grid still loads, cards clickable with new Link wrappers
- `BrainstormEngine` modal (IdeaDetailsDialog) still opens from project pipeline
- Existing full-edit modal in library still works (reachable via "Edit Full" button on new page)

---

## Risks

1. **Library modal and section panel divergence:** the library page has a full-edit modal; the new page has per-section inline/panel edits. If field names or validation drift, users see inconsistency.
   **Mitigation:** extract sub-form components for `monetization_hypothesis`, `repurpose_potential`, `risk_flags` into shared files under `apps/app/src/components/ideas/forms/` — consumed by both library modal and section panel.

2. **PATCH endpoint assumes partial body works for nested JSON fields:** `monetization_hypothesis` is stored inside `discovery_data` (JSONB). A partial PATCH must merge, not replace, that JSON blob.
   **Mitigation:** implementation plan's first task is verifying PATCH shape; if it replaces `discovery_data` wholesale, add a merge helper in the route.

3. **Inline editing UX complexity accumulates:** optimistic updates + rollback + toast + flash + keyboard shortcuts — each `InlineEditableText` instance re-implements this if not shared. Strict adherence to the single shared component + hook is required.

4. **Dual-read for legacy `monetization` field must match `IdeaDetailsDialog`'s already-shipped behavior** (commit `e85c7dd`). Copy the same mapping logic verbatim; do not diverge.

5. **Route `[id]` vs slug:** using UUID keeps URLs stable but breaks "copy URL and share" if a user is used to seeing `BC-IDEA-107`. Acceptable for now; could add a canonical redirect `/en/ideas/BC-IDEA-107 → /en/ideas/[uuid]` later if demand arises.

---

## Dependencies on Other Work

- **Plan A (agent fleet 8.5):** this feature uses `monetization_hypothesis` type rename. Already live on branch `feat/agent-fleet-8.5`. Safe to build on top.
- **`IdeaDetailsDialog.tsx` dual-read fix:** already committed (`e85c7dd`). This page copies the same pattern.

## Summary

Two-column dedicated page at `/en/ideas/[id]` with inline-per-field edits for scalars and section-level edits for complex structures. Read-mount + PATCH for writes. Primary actions: Start Project, Send to Research. Coexists with `BrainstormEngine` modal.
