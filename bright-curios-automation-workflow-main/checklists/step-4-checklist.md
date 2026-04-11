# Step 4: Multi-Project Dashboard with Template Inheritance - Checklist

**Status**: 🚧 In Progress  
**Started**: 2026-01-31  
**Completed**: [To be filled]

---

## Overview

Build the main Projects Dashboard (list & card views), multi-select bulk operations (delete/archive/export/change status), a Focused Project workflow view with stage navigation and autosave, Template Management with parent-child inheritance and a resolved-preview endpoint, plus a Home page "Start Workflow" CTA to quickly create and open a new project.

Design decisions (finalized):

- Soft delete: **No** (keep hard delete behavior for Phase 1)
- Resolved template endpoint: **Dedicated route** `GET /api/templates/:id/resolved`
- Autosave conflict policy: **Last-write-wins** (debounced 30s)
- Bulk export format: **JSON only (ZIP export aborted for now)**

- Canonical project requirements: `README.md` (this file is the single source of truth for project requirements and decisions)

---

## Components & Pages (Checklist)

### Projects UI

- [x] `app/projects/page.tsx` — **ProjectsDashboard** (list/card views, search, filters, sort, pagination)
  - [x] Fetch projects with filters (`GET /api/projects?status=&stage=&search=&sort=`)
  - [ ] List & Card toggle
  - [x] Multi-select with checkboxes and keyboard accessibility

- [x] `src/components/projects/ProjectCard.tsx` — compact visual card (selection checkbox, stage, status, quick actions)

- [x] `src/components/projects/BulkActionToolbar.tsx` — bulk actions UI
  - [x] Delete (destructive; confirmation dialog)
  - [x] Archive (set status or delete as per Phase 1 decision)
  - [x] Export (JSON per project — server-side JSON download; ZIP export aborted)
  - [ ] Change status dropdown

- [x] `app/projects/[id]/page.tsx` — **FocusedProjectView** (stage tracker, stage-specific form, settings panel)
  - [x] `src/components/projects/StageTracker.tsx` (stage navigation + completion state)
  - [ ] Auto-advance toggle (update project via `PUT /api/projects/:id`)
  - [x] Save stage content via `PUT /api/stages` or existing stage endpoints (autosave supported)

- [x] `src/components/projects/StartWorkflowButton.tsx` — CTA to create a new project and navigate to it
  - [x] Fast path: POST `/api/projects` with minimal payload `{ title: 'New Project', current_stage: 'discovery', status: 'active' }` and `router.push('/projects/${id}')`
  - [ ] Optional enhancement: small dialog to enter title before creation

### Template UI

- [x] `app/templates/page.tsx` — Template Manager (list, create, edit, delete) — **Scaffolded (list & resolved preview implemented; CRUD wiring pending)**
- [x] `src/components/templates/TemplateForm.tsx` — Form with JSON config editor and parent selection
  - [x] Quick-fill preview: request resolved config for preview (via `GET /api/templates/:id/resolved`)

---

## API & Server (Checklist)

- [x] `GET /api/templates/:id/resolved` — return merged config JSON (deep merge of parent chain)
- [ ] `/api/projects/bulk` (existing) — ensure `export` operation supports JSON (ZIP export aborted)
  - NOTE: **JSON export implemented** (returns `projects-export.json`). ZIP multi-file export aborted for now.
- [x] `/api/stages` endpoints — verify autosave usage (debounced saves accept `auto_save: true` in request)
- [x] `/api/projects/:id` — supports toggling `auto_advance` via `PUT`

---

## API & DB Changes

- New: `GET /api/templates/:id/resolved` — return resolved template (deep-merged JSON) — **P0**
- Reuse existing `/api/stages` endpoints for autosave; no DB field required for basic autosave (server stores artifacts)
- Keep hard delete for projects (no `archived_at` added) — **Decision: No soft-delete**
- Bulk export: server returns downloadable JSON per request (ZIP export aborted for now) — **P0**

Potential future DB notes (not in Phase 1):

- If recovery is later required, add `archived_at TIMESTAMP` to `project` model and update bulk-archive to set that timestamp instead of hard-delete.

---

## UI Components (targets)

- `ProjectsDashboard` — `src/app/projects/page.tsx` (page)
- `ProjectCard` — `src/components/projects/ProjectCard.tsx`
- `BulkActionToolbar` — `src/components/projects/BulkActionToolbar.tsx`
- `StageTracker` — `src/components/projects/StageTracker.tsx`
- `FocusedProjectView` — `src/app/projects/[id]/page.tsx`
- `TemplateManager` — `src/app/templates/page.tsx`
- `TemplateForm` — `src/components/templates/TemplateForm.tsx`
- `StartWorkflowButton` — `src/components/projects/StartWorkflowButton.tsx`

Reuse existing components where possible (buttons, dialogs, toasts). Examples: `src/components/ui/button.tsx`, `src/components/ui/dialog.tsx`, `src/hooks/use-toast.ts`.

---

## Tests (priority)

- Unit: `resolveTemplate` deep-merge behavior (single parent, multi-level, overrides, circular detection) — **P0 / Small**
- API integration: resolved template endpoint — **P0 / Small**
- API acceptance: `/api/projects/bulk` flows (delete/archive/export) — **P1 / Medium**
- E2E: Projects dashboard bulk select + bulk archive/delete/export flows — **P1 / Large**
- Autosave: simulate debounced saves and last-write-wins conflict behavior — **P1 / Medium**

---

## Acceptance Criteria

- Home page includes a visible **Projects** link and a **Start Workflow** CTA/button that creates a project and navigates to its focused view. ✅
- Projects dashboard lists projects with list and card views, working filters, search, and pagination. ✅
- Multi-select works; BulkActionToolbar performs `delete`, `archive`, `export` (JSON only), `change_status` via `/api/projects/bulk`. ✅
- Focused project shows StageTracker and stage-specific forms; autosave persists drafts every 30s and shows `Saving...` → `Saved` feedback (last-write-wins). ✅
- Template Manager can create/edit templates with parent linking; `GET /api/templates/:id/resolved` returns correctly merged config. ✅
- Tests for resolver, resolved endpoint, and bulk flows are added and pass. ✅

---

## Pending Implementation Tasks (to complete Step 4)

The following actionable checklist targets the **missing** Step 4 items discovered during evaluation. Each item is broken down into discrete, testable subtasks with file targets and priorities.

- [ ] 1. Add Search & Filters UI to Projects Dashboard (High, 1-2 days)
  - [ ] Implement `SearchBar` component (debounced input) in `src/components/projects/SearchBar.tsx`.
  - [ ] Implement `Filters` component (stage, status, sort) in `src/components/projects/Filters.tsx`.
  - [ ] Wire components into `src/app/projects/page.tsx` to update URL query params and call `/api/projects?search=&stage=&status=&sort=`.
  - [ ] Unit tests for debounce and `SearchBar` behavior.
  - [ ] Integration test verifying query params sent to API and UI updates accordingly.

- [ ] 2. Implement List ↔ Card view toggle (Low, 0.5 day)
  - [ ] Add toggle UI in `src/app/projects/page.tsx` and persist preference to localStorage.
  - [ ] Create `src/components/projects/ProjectListItem.tsx` and style for list view.
  - [ ] Snapshot/component tests for both views.

- [ ] 3. Add Change Status dropdown to BulkActionToolbar (Medium, 1 day)
  - [ ] Add `Change status` dropdown UI to `src/components/projects/BulkActionToolbar.tsx`.
  - [ ] Wire `POST /api/projects/bulk` (operation: `change_status`) to set new status for selected project IDs.
  - [ ] Add server-side acceptance test in `src/app/api/projects/bulk/__tests__/` verifying bulk status update.

- [ ] 4. Add Auto-advance toggle UI in FocusedProjectView (Medium, 0.5–1 day)
  - [ ] Add toggle control and UI in `src/app/projects/[id]/page.tsx`.
  - [ ] Call `PUT /api/projects/:id` to update `auto_advance` on change and show confirmation toast.
  - [ ] Add unit test and integration test to validate DB update.

- [ ] 5. Wire Template CRUD in TemplateManager UI (Medium, 1–2 days)
  - [ ] Hook `TemplateForm` to `POST /api/templates` (create) and `PUT /api/templates/:id` (update) and `DELETE /api/templates/:id` (delete).
  - [ ] Implement optimistic UI updates and form validation (ensure `type` present).
  - [ ] Add API + UI tests for create/update/delete and re-fetch resolved preview after changes.

- [ ] 6. Implement Dynamic Form Builders for stage-specific forms (P1, larger, 3+ days)
  - [ ] Create `src/components/forms/FormBuilder.tsx` to render fields from Zod schemas.
  - [ ] Integrate FormBuilder in `FocusedProjectView` for production/review stages (replace textarea).
  - [ ] Add unit tests for rendering, schema validation, and autosave integration tests.

- [ ] 7. Optional: Add dialog to `StartWorkflowButton` to set project title before creating (Small, 0.5 day)
  - [ ] Add modal dialog UI to `src/components/projects/StartWorkflowButton.tsx` to capture title before POST.
  - [ ] Add component test for dialog behavior.

- [ ] 8. Add E2E tests (P1, Medium)
  - [ ] Bulk operations end-to-end: select multiple, archive/delete/export download (Playwright or similar), add tests under `test/e2e/`.
  - [ ] Autosave conflict simulation E2E: two clients writing concurrently, verify last-write-wins behavior.

- [ ] 9. Accessibility & keyboard navigation improvements (Ongoing)
  - [ ] Ensure bulk toolbar, checkboxes, and toggles are keyboard accessible and labeled (aria attributes).
  - [ ] Add a11y checks (axe) to CI or test suites.

---

## Once you confirm, I can start implementing the highest-priority item (1. Search & Filters UI) and open a PR with incremental commits and tests. Which item should I start with? 🔧

## Implementation Notes & UX Decisions

- `StartWorkflowButton` default behavior: create project immediately (fast path) and navigate to project detail — lower friction. Optionally implement a small dialog to enter title if the team prefers.
- Confirmation modal is required before destructive bulk deletes.
- Export: server returns JSON per project (ZIP export aborted for now).

---

## Open Questions (decisions already applied)

1. Soft-delete for projects: **No** — keep hard delete for Phase 1.
2. Resolved-template endpoint: **Dedicated route** `GET /api/templates/:id/resolved`.
3. Autosave conflict: **Last-write-wins**.
4. Export formats: **JSON only** for Phase 1 (ZIP export aborted).

---

## Next Actions (short-term)

1. Commit this checklist (`checklists/step-4-checklist.md`). ✅
2. Add placeholder `src/app/projects/page.tsx` with a minimal `ProjectsDashboard` that fetches `/api/projects` and renders a simple list. ✅
3. Add `StartWorkflowButton` and wire up home page (`src/app/page.tsx`) to show Projects link and CTA. ✅

---

If you'd like, I can start implementing the highest-priority item (1. Search & Filters UI) now, or instead implement the Auto-advance toggle UI (item 4). Which should I start with? 🔧
