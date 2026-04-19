# Assets Engine Redesign

**Date:** 2026-04-19
**Status:** Approved — ready for implementation plan

## Goal

Redesign the Assets pipeline stage to support three user flows (Full AI, Semi-automated, Fully Manual) via progressive disclosure, and align its manual-provider UX with the pattern established for Brainstorm / Research / Draft / Review.

## Background

The current `AssetsEngine`:

- Uses a legacy `ManualModePanel` copy-input pattern that predates the `ManualOutputDialog` pattern now standard across other engines.
- Has no AI path for generating prompt briefs — the existing `POST /api/content-drafts/:id/asset-prompts` endpoint is data-only (builds `BC_ASSETS_INPUT`, never calls an LLM).
- Couples brief generation and image generation into a single "Generate All" bulk path that targets a non-existent backend route.
- Offers no fully-manual "I'll pick images myself" path — refining prompts is a required step.

The user's three desired flows are:

1. **Full AI** — AI generates refined prompts → AI generates images → preview.
2. **Semi-automated** — AI generates refined prompts → user copies prompts → user generates or sources images externally → user uploads images.
3. **Fully Manual** — no prompt generation → user sees section titles + content → user sources and uploads images.

## Scope

**In scope:**

- UI redesign of `apps/app/src/components/engines/AssetsEngine.tsx` into three phases: Briefs → Refine → Images.
- One new backend route: `POST /api/content-drafts/:id/generate-asset-prompts` wrapping an LLM call to produce `BC_ASSETS_OUTPUT` from `BC_ASSETS_INPUT`.
- New agent definition: `agents/agent-5-assets.md` + seed into `agent_prompts`.
- Replace legacy `ManualModePanel` with `ManualOutputDialog` pattern.
- Client-side markdown section splitter for the "no briefs" flow.

**Out of scope (follow-up specs):**

- Credits accounting for AI brief generation and AI image generation.
- ChatGPT / OpenAI image provider wiring (image generation stays Gemini-only + manual-as-upload).
- Persisting briefs + generated images to a `content_drafts.asset_prompts_json` column.
- The bulk `/generate-assets` "Generate All Images" path (currently targets a non-existent endpoint; will be removed).

## Architecture

### New backend route

`POST /api/content-drafts/:id/generate-asset-prompts`

**Request body:**

```json
{
  "provider": "gemini" | "openai" | "manual",
  "model": "optional-model-override"
}
```

**Behavior:**

1. Load the draft, verify ownership, build `BC_ASSETS_INPUT` (reuse the existing extraction logic from `POST /:id/asset-prompts`).
2. Load the `assets` agent system prompt via `loadAgentPrompt('assets')`.
3. **AI path** (`gemini` / `openai`): call `generateWithFallback('assets', modelTier, { systemPrompt, userMessage }, { provider, model, logContext })`. Parse the result; return `{ visual_direction, slots[] }` in the response envelope.
4. **Manual path**: combine system + user messages into a single prompt, emit to Axiom via `logAiUsage({ action: 'manual.awaiting', stage: 'assets', prompt })`, return `{ status: 'awaiting_manual' }` with HTTP 202. No database row is persisted for the waiting state — the client handles the round-trip with `ManualOutputDialog` and feeds the parsed output straight into component state.

**Error handling:** map LLM failures to the `{ data, error }` envelope with `friendlyAiError`-compatible messages.

### Agent definition

New file: `agents/agent-5-assets.md`. Contract: input `BC_ASSETS_INPUT`, output `BC_ASSETS_OUTPUT` matching the shape the existing `parseAssetsOutput` already expects:

```json
{
  "visual_direction": {
    "style": "string",
    "color_palette": ["#hex", ...],
    "mood": "string",
    "constraints": ["string", ...]
  },
  "slots": [
    {
      "slot": "featured" | "section_1" | ...,
      "section_title": "string",
      "prompt_brief": "string",
      "style_rationale": "string",
      "aspect_ratio": "16:9" | "1:1" | "9:16" | "4:3"
    }
  ]
}
```

Seed row into `agent_prompts` table (slug `assets`). Follow the existing seed convention in `scripts/generate-seed.ts`.

### Image generation

No backend change. `POST /api/assets/generate` stays Gemini-only. In the UI, "Gemini (nano-banana)" is the only labelled AI provider for image generation.

## UI Structure

Three phases with a visible stepper: **Briefs → Refine → Images**. Existing "Upload" and "Done" phase markers are folded into "Images".

### Phase 1 — Briefs

Single card with two mutually-exclusive options:

1. **Generate briefs**
   - `ModelPicker` with providers `[gemini, openai, manual]`.
   - Single Start button.
   - AI providers: call `POST /generate-asset-prompts`, populate briefs state, advance to Phase 2.
   - Manual provider: call same endpoint, receive `awaiting_manual`, open `ManualOutputDialog`. On submit, parse pasted JSON with existing `parseAssetsOutput`, populate briefs state, advance to Phase 2.

2. **Skip briefs — I'll pick images from section content**
   - Advances directly to Phase 3 in "no-briefs mode".

### Phase 2 — Refine (only reached when briefs exist)

- Visual-direction banner (style, mood, color palette swatches, constraints).
- Per-slot card: editable prompt textarea, aspect-ratio dropdown, `Copy full prompt` button.
- Actions: `Continue to Images` (→ Phase 3 brief mode), `Regenerate briefs` (→ Phase 1).

### Phase 3 — Images

Two sub-modes depending on how Phase 3 was entered:

#### Brief mode (from Refine)

Per-slot card:

- Read-only refined prompt, collapsed by default, expandable.
- Aspect ratio (read-only, set during Refine).
- Two actions:
  - **Generate with AI** — calls `POST /api/assets/generate` with composed full prompt, role, aspect ratio, `content_id = draftId`. On success, add to `existingAssets`, show inline preview, replace any previous asset in the same role.
  - **Upload** — existing file/URL upload flow, staged as pending.
- Inline preview rendered for whichever source succeeded.
- Users can mix AI and Upload per slot freely — this is where "Full AI" and "Semi-automated" flows diverge.

#### No-briefs mode (from Phase 1 Skip)

Per-slot card:

- Section title (H2).
- Key points bullet list (always visible, from `/asset-prompts` output).
- Expandable `Read full section` — renders the markdown block under that H2 parsed from `draft_json.blog.full_draft` (client-side split, see below). Includes `Copy section text` button.
- Action: **Upload only** (file/URL). No `Generate with AI` — there is no prompt to generate from.

### Section text splitter (client-side)

Helper function splits `draft_json.blog.full_draft` by `^##\s+` headings:

- Each `##` heading and its following content (up to the next `##`) becomes one section.
- The featured slot receives the intro text (everything before the first `##`).
- Section slots are matched to outline sections by order.
- Used only in Phase 3 no-briefs mode.

### Completion

- All images optional (including featured). `Finish & Save` is always enabled once the user reaches the Images phase.
- On Finish: upload any pending URLs/files to `/api/assets/upload`, refetch the draft's assets, call `onComplete({ assetIds, featuredImageUrl? })` where `featuredImageUrl` is derived from whichever asset has `role = 'featured_image'` (may be undefined).

## Data flow

- **AI brief gen:** client → `POST /generate-asset-prompts` → LLM → parsed briefs → client state → Phase 2.
- **Manual brief gen:** client → `POST /generate-asset-prompts` with `provider=manual` → Axiom emit + `awaiting_manual` response → client opens `ManualOutputDialog` → user pastes JSON → client parses → Phase 2.
- **AI image gen per slot:** client → `POST /api/assets/generate` → asset row created → client adds to `existingAssets`, renders preview.
- **Upload per slot:** client stages file/URL → on Finish, flush to `POST /api/assets/upload` → assets persisted.

State survives refresh only for assets that were persisted server-side (i.e., AI-generated images). Brief state and pending uploads are lost on refresh. Persisting briefs + pending state is out of scope (see "Out of scope").

## Error handling

- `/generate-asset-prompts` failure: surface `friendlyAiError` toast, stay on Phase 1.
- Manual paste unparseable: `parseAssetsOutput` returns null → existing toast showing top-level keys.
- Per-slot image-gen failure: toast with provider error, leave slot empty, user retries.
- Per-slot upload failure: toast, slot's pending state preserved for retry.

## Testing

Category A/B tests (no DB access):

- Unit test `parseAssetsOutput` against sample `BC_ASSETS_OUTPUT` fixtures (already covered — verify regressions).
- Unit test the new section splitter against sample markdown drafts with and without intro text, varying heading counts.
- Unit test the existing `buildFullPrompt` composer with and without visual direction.
- API route tests for `/generate-asset-prompts`:
  - Happy path with mocked `generateWithFallback` returning valid `BC_ASSETS_OUTPUT`.
  - Manual provider path — verify `202 awaiting_manual` response + Axiom emit.
  - LLM error path — verify `{ data, error }` envelope maps the error correctly.
  - Unauthorized / not-found cases.

## Migration

- Remove `ManualModePanel` import from `AssetsEngine.tsx`. Leave the component itself in place unless no other consumers exist (grep first).
- Remove the `handleGenerateAll` bulk path and its "Auto Generate All" tab — it targets a non-existent `/generate-assets` route.
- Existing drafts without briefs land on Phase 1 on mount (unchanged).
- Drafts with existing assets skip directly to Phase 3 (Images) on mount, with existing assets rendered in their matching slots and `Finish & Save` enabled. Since assets can be keyed to roles (`featured_image`, `body_section_1`, ...), match by role. Slots that aren't present in the current briefs but have existing assets still render so the user can see/replace them.

## Open questions

None — all design decisions locked during brainstorming session.
