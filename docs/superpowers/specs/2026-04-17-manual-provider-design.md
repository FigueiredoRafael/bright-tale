# Manual Provider — Design Spec

**Date:** 2026-04-17
**Status:** draft
**Scope:** Brainstorm engine first; pattern replicates to Research, Draft, Review.

## Summary

Introduce a new AI provider called `manual` that behaves like any other selectable model (GPT-4, Claude, Gemini) but short-circuits the LLM call. When chosen, the engine builds the full prompt payload, emits it to Axiom, persists the engine session in an `awaiting_manual` state, and presents the user with a modal containing a single textarea to paste an output produced externally (e.g., in ChatGPT/Claude UI). The prompt itself is never shown in the product UI — operators retrieve it from Axiom.

This replaces the current "AI / Manual (ChatGPT/Gemini)" toggle inside `ManualModePanel`, which is removed. Manual becomes a first-class provider in the model picker instead of a separate UI mode.

## Motivation

- The current `ManualModePanel` exposes the raw prompt in the UI and duplicates the engine flow under a "Manual" tab. That prompt should not be visible to every product user.
- Operators / prompt engineers already monitor Axiom. Routing the full payload there gives them a single place to inspect inputs and iterate externally.
- Making `manual` a provider unifies telemetry: every generation (AI or manual) flows through the same Axiom + `engine_logs` path, so we can reason about latency, success, and prompt drift consistently.

## Architecture

### Provider registration

1. Add one row to `ai_provider_configs` with `provider = 'manual'`. No special config fields. This is documentation-only at the moment — the router does not yet consume the table. Wiring the table up is a separate, future concern.
2. In `apps/api/src/lib/ai/router.ts`:
   - Add `'manual'` to the provider union / enum used by `createProvider`.
   - Add a short-circuit in `generateWithFallback()` (or `createProvider()`, whichever keeps the diff small): if the selected provider is `manual`, skip every LLM call, emit the full input payload via `logAiUsage({ action: 'manual.awaiting', provider: 'manual', model: 'manual', inputTokens: 0, outputTokens: 0, totalTokens: 0, durationMs: 0, status: 'awaiting_manual', metadata: { prompt, systemPrompt, ... } })`, and return a typed response shaped like `{ awaitingManual: true }` instead of a normal completion.
3. The existing `engine_logs` write path (fire-and-forget in `engine-log.ts`) logs the same event with `status = 'awaiting_manual'` so the admin engine-logs UI shows the pending job.
4. Manual is terminal in the provider chain: if the user explicitly selects it, no other provider is tried. It is not inserted into the `ROUTE_TABLE` fallback tiers — it is opt-in only via explicit `provider: 'manual'` selection in the request.

### Brainstorm API

`POST /api/brainstorm/sessions` (and whichever route currently dispatches to `generateWithFallback`):

- Inspect the resolved provider. If `manual`:
  - Persist a new `brainstorm_sessions` row with `status = 'awaiting_manual'`, `input_json = <full prompt payload>`, and `output_json = null`.
  - Return envelope: `{ data: { sessionId, status: 'awaiting_manual' }, error: null }`.
  - Do not invoke Inngest or any async worker.
- Otherwise, existing behavior is unchanged.

Output submission uses a **new endpoint** `POST /api/brainstorm/sessions/:id/manual-output`:

- Accepts `{ output: unknown }` — the raw pasted JSON from the modal.
- Validates that the session exists and is in `status = 'awaiting_manual'`; otherwise 409.
- Runs the same idea-extraction logic currently in `BrainstormEngine.handleManualImport` (recursive `findIdeas`, validation, verdict normalization), but server-side.
- Persists ideas into `idea_archives` with `session_id` set (tying them to the session, unlike the current client-side manual flow that posts to `/api/ideas/library` with no session linkage).
- Updates `brainstorm_sessions`: `output_json = <pasted JSON>`, `status = 'completed'`, `completed_at = now()`.
- Emits `logAiUsage({ action: 'manual.completed', status: 'success', metadata: { sessionId, stage: 'brainstorm', output } })`.
- Returns envelope with the saved ideas list: `{ data: { ideas: [...] }, error: null }`.

The old client-side `handleManualImport` (which posts per-idea to `/api/ideas/library`) is removed. The modal submit calls the new endpoint once with the full parsed JSON.

### UI — BrainstormEngine

1. Remove the AI / Manual tab toggle from `ManualModePanel`. `ManualModePanel` as a standalone component either goes away or becomes an internal helper for the new modal (whichever minimizes duplication). The "copy prompt" half is deleted entirely — the prompt is secret.
2. In `BrainstormEngine`:
   - The model picker lists `manual` alongside GPT-4 / Claude / Gemini.
   - On "Generate", POST to the same endpoint as today. If the response is `{ status: 'awaiting_manual' }`, open a modal instead of showing a spinner.
   - The modal contains: a short instruction ("Retrieve the prompt from Axiom and paste the output below"), one textarea for the pasted output, a Submit button, and a Cancel button.
   - Submit calls the existing import endpoint with the pasted JSON. Success closes the modal and advances the engine state identically to an AI-generated completion.
   - Cancel leaves the session in `awaiting_manual`; the user can reopen the modal from the engine stage header (same affordance used to "resume" an in-progress session today).

### Telemetry / Axiom payload

The Axiom event emitted on a manual dispatch carries:

- `userId`, `orgId`, `action: 'manual.awaiting'`
- `provider: 'manual'`, `model: 'manual'`
- `inputTokens: 0`, `outputTokens: 0`, `totalTokens: 0`, `durationMs: 0`
- `status: 'awaiting_manual'`
- `metadata: { sessionId, stage: 'brainstorm', prompt, systemPrompt, input: <full BC_*_INPUT>, channelId, ideaId? }`

On submission (through the import endpoint), a second event is emitted with `action: 'manual.completed'`, `status: 'success'`, `metadata: { sessionId, stage, output: <full BC_*_OUTPUT> }`. This closes the loop in the engine-logs dashboard and in Axiom.

## Data flow

```
user picks Manual → Generate
    ↓
API builds prompt → logAiUsage(manual.awaiting) → persist session (awaiting_manual) → return { status: awaiting_manual }
    ↓
UI opens modal (textarea only)
    ↓
user copies input from Axiom → runs it in external AI → pastes output in modal → Submit
    ↓
UI → POST /api/brainstorm/sessions/:id/manual-output (new endpoint)
    ↓
API validates, persists ideas (session_id set), flips session → completed → logAiUsage(manual.completed)
    ↓
UI advances stage identically to AI mode
```

## Error handling

- **Invalid pasted JSON**: the new `manual-output` endpoint returns 400 with a descriptive error (e.g., "No ideas found in pasted output"); the modal surfaces it via toast + inline error.
- **User closes modal without submitting**: session stays `awaiting_manual`. Reopening the engine stage detects the state via the existing session-hydration logic (`/api/brainstorm/sessions/:id`) and reopens the modal. A session already in `completed` does not reopen it.
- **Concurrent submissions**: the `manual-output` endpoint guards on `status = 'awaiting_manual'`; a second call returns 409.
- **Provider dispatch failure before Axiom emit**: propagate as any other 500. No session row created.
- **Malformed Axiom emit**: fire-and-forget; failures do not block session creation or output submission.

## Testing

- **Unit**: `router.ts` — provider=manual short-circuits, does not call any LLM client, emits `manual.awaiting` to Axiom, returns `{ awaitingManual: true }`.
- **Unit**: `logAiUsage` receives a payload with full `metadata.prompt` and `metadata.input`.
- **Integration** (API): `POST /brainstorm/sessions` with `provider: 'manual'` returns `awaiting_manual` envelope and persists session row with status=`awaiting_manual`, no Inngest event fired.
- **Integration** (API): `POST /brainstorm/sessions/:id/manual-output` — valid payload persists ideas with `session_id` and flips session to `completed`; invalid payload returns 400; non-awaiting session returns 409.
- **UI** (component): `BrainstormEngine` opens the modal when response is `awaiting_manual`; submit calls `manual-output` endpoint; cancel leaves the session open for resume. Prompt string is never rendered in the DOM.

## Out of scope

- Wiring `ai_provider_configs` into the runtime router (separate refactor).
- Replicating to Research / Draft / Review engines. Done as a follow-up once Brainstorm validates.
- Any admin-side tooling in Axiom (alerts, dashboards, shortcuts to copy the prompt). Operators use the standard Axiom UI.
- A webhook / polling mechanism for external tools to submit the output back automatically. The only submission path is the paste-in-modal UI.
- Handling the `manual` provider inside Inngest async jobs. Manual is synchronous by definition: the API returns `awaiting_manual` immediately; no background worker participates.

## Rollout

1. Implement Brainstorm end-to-end behind the model picker (no flag; Manual is just another selectable model).
2. Validate manually: pick Manual, check Axiom payload, paste a BC_BRAINSTORM_OUTPUT, confirm the stage completes and downstream stages (research) receive the correct input.
3. Replicate the same shape to Research, Draft, Review in separate commits once Brainstorm is confirmed.
