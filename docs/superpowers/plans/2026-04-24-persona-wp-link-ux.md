---
title: Persona WP Link UX — Follow-up B
date: 2026-04-24
status: approved
branch: feat/persona-eeat-layer
---

# Follow-up B: Persona → WordPress Link UX

## Problem

User clicked "Link Author" on persona edit and got `Failed to link WordPress author`. Underlying API returned `400 NO_WP_CONFIG` because the selected channel has no `wordpress_config_id`. Two UX gaps:

1. **Channel picker offers unusable options.** `PersonaForm` shows every channel in the picker, including channels without a WordPress config. User picks one, tries to link, and it fails.
2. **Generic error swallows the real cause.** `WpIntegrationSection` falls back to `"Failed to link WordPress author"` for every failure, hiding the actual `NO_WP_CONFIG` / `WP_USER_NOT_FOUND` / etc. codes the API returns.

## Solution

No API change needed. `/api/channels` already returns `wordpress_config_id` on every row (via `select('*')`). Frontend filter + specific error messaging.

## Tasks

### Task 1 — Filter channel picker to WP-configured channels only

**File:** `apps/app/src/components/personas/PersonaForm.tsx`

**Changes:**
- Widen channel state type from `Array<{ id: string; name: string }>` to include `wordpress_config_id: string | null`.
- After fetch, filter to `items.filter(c => c.wordpress_config_id != null)` before putting into state.
- If filtered list is empty but raw list had channels, show message: `"None of your channels have WordPress configured. Add a WordPress config in Channel → Settings → WordPress first."` instead of the picker.
- Keep existing "Create a content channel first…" message when raw list is empty (already covers the no-channels case).

**Acceptance:**
- User with 0 channels: sees existing "Create a content channel first…" message.
- User with 2 channels, neither has WP config: sees new "None of your channels have WordPress configured…" message.
- User with 2 channels, 1 has WP config: picker shows only the WP-configured one.
- User with 2 channels, both have WP config: picker shows both.

### Task 2 — Surface specific API errors in WpIntegrationSection

**File:** `apps/app/src/components/personas/WpIntegrationSection.tsx`

**Changes:**
- Map known API error codes from `apps/api/src/routes/personas.ts:217-296` (the `/:id/integrations/wordpress` handler) to user-facing messages:
  - `NO_WP_CONFIG` → `"This channel has no WordPress site configured. Configure it in Channel → Settings → WordPress first."`
  - `WP_CONFIG_NOT_FOUND` → `"WordPress config missing. Re-link WordPress in Channel → Settings."`
  - `WP_USER_NOT_FOUND` → `"No WordPress user matches that username on this site."`
  - `WP_FETCH_ERROR` → `"Could not reach WordPress. Check the site URL in Channel → Settings."`
  - `WP_CREATE_ERROR` → surface `apiError.message` (WordPress already returns specific reasons — e.g. email conflict).
  - `VALIDATION_ERROR` → surface `apiError.message` (covers missing `wpUsername`).
  - Default → keep `apiError.message ?? "Failed to link WordPress author"`.
- Use `apiError.code` (not `apiError.message`) for the switch. The API envelope is `{ data, error: { code, message } }`.

**Acceptance:**
- Selecting a channel without WP config and clicking Link → sees the specific `NO_WP_CONFIG` message, not the generic fallback.
- Other known codes render their mapped messages.
- Unknown codes still fall back to `apiError.message` so we never lose server detail.

## Out of scope

- New `/api/channels?has_wp=true` filter endpoint (client-side filter is enough; we already have the field).
- Surfacing error codes in other persona integrations (there are none yet).
- Guided wizard / manual paste mode (those are Follow-ups C and A).

## Verification

1. Typecheck passes (`npm run typecheck`).
2. Lint passes (`npm run lint`).
3. Manual: persona edit page, channel without WP config → no longer appears in picker.
4. Manual: force a `NO_WP_CONFIG` response (pick channel before filter lands, or hit API directly) → error message names the channel config as the cause.

## Commits

One commit per task, scoped and focused.
