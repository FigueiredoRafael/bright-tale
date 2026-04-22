# Agent Fleet 8.5+ — Design Spec

**Date:** 2026-04-21
**Status:** draft
**Baseline:** `docs/agent-prompt-audit-post-improvement.md` (fleet avg 7.6, lowest Review 7.0)
**Goal:** Every agent scores ≥ 8.5 on the 13-criterion audit.
**Scope:** Agent prompts (`scripts/agents/*.ts`) + mappers (`packages/shared/src/mappers/`) + Review output schema + downstream engine UIs that consume renamed fields.

---

## Problem

Post-improvement fleet average is 7.6. Only Content Core (8.2) is above 8.0. Review (7.0), Brainstorm (7.1), and Video (7.2) drag the floor. Three structural issues remain:

1. **Runtime handoff lag** — Phase 4 expanded Review's input schema, but mapper functions still strip those fields. Schema is aspirational.
2. **Subjective `score`** — Review outputs 0-100 with no deterministic rubric. Same content scores differently across runs (idempotency 6).
3. **Fabrication-prone fields** — Brainstorm `monetization.product_fit`/`sponsor_appeal`, Podcast `personal_angle`, Research URL confidence in some domains. Each invites fabrication without user-visible framing.

Goal: move fleet floor to 8.5 via surgical prompt edits, mapper alignment, and one schema-level change to Review (score → enum rubric).

---

## Per-Agent Targets

| Agent | Current | Target | Gap |
|-------|---------|--------|-----|
| Brainstorm | 7.1 | 8.5 | +1.4 |
| Research | 7.5 | 8.5 | +1.0 |
| Content Core | 8.2 | 8.5 | +0.3 |
| Blog | 7.7 | 8.5 | +0.8 |
| Video | 7.2 | 8.5 | +1.3 |
| Shorts | 8.0 | 8.5 | +0.5 |
| Podcast | 7.5 | 8.5 | +1.0 |
| Engagement | 7.8 | 8.5 | +0.7 |
| Review | 7.0 | 8.5 | +1.5 |

---

## Architecture — 6 Themes

Work organized into 6 themes. Each theme is a coherent changeset with defined blast radius.

**Implementation ordering:**
1. **Theme 6 first** (field renames) — sets final field names so later themes and mappers reference them consistently.
2. **Theme 1** (mappers) — now uses renamed fields from Theme 6.
3. **Theme 2** (Review overhaul) — schema change + orchestrator threshold.
4. **Themes 3-5** (polish) — can run in parallel; no shared state.

Theme 1 (mappers) remains the biggest unblock for handoff-related criteria fleet-wide, but sequencing Theme 6 first avoids renaming-in-place.

### Theme 1 — Mapper + Review-input alignment

**Problem:** Phase 4 declared input fields in Review schema but mappers still strip them.

**Work:**
- Audit `packages/shared/src/mappers/` (`pipeline.ts`, `db.ts`) for mapper functions: `mapBlogToReviewInput`, `mapVideoToReviewInput`, `mapShortsToReviewInput`, `mapPodcastToReviewInput`, `mapEngagementToReviewInput`.
- Update each to pass through declared fields:
  - Blog → Review: `slug`, `primary_keyword`, `secondary_keywords`, `outline`, `affiliate_integration`, `internal_links_suggested`.
  - Video → Review: `teleprompter_script`, `editor_script`, `video_description`, `chapters[]`, `thumbnail` object, `chapter_count`.
  - Shorts → Review: arrOf of `{hook, script, visual_style, duration_target}` (verify objects, not stringified).
  - Podcast → Review: `episode_description`, `intro_hook`, `host_talking_prompts` (renamed in Theme 6), `guest_questions`, `outro`.
  - Engagement → Review: `hook_tweet`, `thread_outline`.
- Update `__tests__/pipeline.test.ts` — assert every declared field round-trips without loss.
- Review `rules.validation` adds: "Flag any declared input field that arrives null/undefined — do not silently skip."

**Criteria impact:**
- Blog crit 4: 6→9 (+3)
- Video crit 4: 5→9 (+4)
- Shorts crit 4: 7→9 (+2)
- Podcast crit 4: 5→8 (+3)
- Engagement crit 4: 5→8 (+3)
- Review crit 4: 7→9 (+2)

### Theme 2 — Review overhaul

**Problem:** Review is 7.0 (lowest). Three interlocked issues: subjective numeric score, 528-line prompt, weak malformed-input handling.

**Work:**

**2a. Replace numeric score with enum rubric.**
- Output schema change: `score: number (0-100)` → `quality_tier: enum('excellent'|'good'|'needs_revision'|'reject')`.
- Add new output field: `rubric_checks: { critical_issues: string[], minor_issues: string[], strengths: string[] }`.
- Deterministic derivation rule in `rules.validation`:
  - `0 critical + ≤2 minor` → `excellent`
  - `0 critical + 3-5 minor` → `good`
  - `1-2 critical OR ≥6 minor` → `needs_revision`
  - `3+ critical` → `reject`
- `ready_to_publish = quality_tier in ('excellent', 'good')`.
- Update `PipelineOrchestrator` review-loop threshold from `score >= 90` to `quality_tier in ('excellent', 'good')`.
- Update `ReviewEngine` UI to render tier badge + issue lists instead of numeric score.
- Update Zod schemas in `packages/shared/src/schemas/` for the new Review output shape.
- Add migration note: historical reviews with numeric `score` remain readable; display layer handles both shapes for 30 days (matches project's legacy format policy).

**2b. Compress customSections (528 → ~320 lines).**
- Each per-content-type review section (Blog, Video, Shorts, Podcast, Engagement) trimmed from ~60 lines to ~30-40 via:
  - One example per section, not 2-3.
  - Rubric bullets replace prose paragraphs.
  - Drop redundant YAML-style examples.

**2c. Malformed-input guardrails.**
- Add to `rules.content`:
  - "If `production.{type}` field is null/undefined/empty, set `quality_tier='needs_revision'` and add `critical_issue='Missing required field: {type}.{field}'`."
  - "If production payload is malformed JSON string, set `quality_tier='reject'` with `critical_issue='Malformed production payload'`."
  - "If `content_types_requested` includes a type not present in `production`, flag as critical_issue."

**Criteria impact (Review):**
- crit 5: 6→9 (+3) — deterministic rubric
- crit 6: 6→8 (+2) — malformed handlers
- crit 7: 4→7 (+3) — compression
- crit 9: 6→9 (+3) — enum + deterministic counts
- crit 10: 7→9 (+2) — enum checkable
- crit 11: 7→8 (+1) — compression trims duplicates
- crit 13: 7→9 (+2) — subjective score replaced

### Theme 3 — Hallucination polish

**Problem:** Research, Brainstorm, Podcast have residual fabrication surfaces after Phase 2.

**Work:**

**3a. Research.**
- Add `content_warning: string` field to output schema.
- Rule: "If fewer than `depth`-required sources verifiable, populate `content_warning` with what's missing instead of padding with weak sources."
- Dedupe `purpose` section overlap with `rules.content` (6 duplicate lines per audit).
- Remove "request clarification" dead instruction (impossible in single-turn JSON mode).
- `statistics[].figure` rule: "Only include stats with source attribution matching an entry in `sources[]`. No standalone figures."
- `expert_quotes[].quote` rule: "Never fabricate attributed quotes. If no verified quote, set quotes to empty array and note in `content_warning`."
- URLs stay as-is (user reports high accuracy in practice).
- Add domain preference: "Prefer well-known domains (.edu, .gov, major publications, Wikipedia) when choosing sources."

**3b. Brainstorm.**
- Document user-message contract in `rules.content`: "User message should specify: count (default: 5), topic/angle, optional constraints. If count omitted, generate 5."
- Add `content_warning: string` to output schema (consistency with other agents).
- Add `rules.validation`: "Every idea must have `verdict` in ('green'|'yellow'|'red'). Empty ideas array is valid only if topic deemed unviable — populate `content_warning`."
- Tighten `monetization.product_fit`/`sponsor_appeal` rule: "Generic categories only (e.g., 'outdoor brands', 'SaaS productivity tools'). Do not name specific companies unless user provided them."

**3c. Podcast.**
- Add `rules.validation`: "`intro_hook` must open in 1st or 2nd person. `outro` must contain a subscribe/follow CTA verb." Programmatically checkable.

**Criteria impact:**
- Research crit 6: 7→9, crit 11: 6→8, crit 12: 7→9, crit 13: 6→8
- Brainstorm crit 2: 5→8, crit 6: 5→8, crit 10: 6→8, crit 13: 7→9
- Podcast crit 6: 8→9, crit 10: 6→8

### Theme 4 — Token/redundancy final pass

**Work:**

**4a. Video.**
- Define `editor_script` schema. Replace empty `obj(..., {}, false)` with:
  ```
  arrOf('scenes', 'Ordered scene list for editor', [
    str('scene_number', '1-indexed'),
    str('visual_direction', 'What viewer sees'),
    str('audio_cue', 'Music/SFX at this scene', false),
    str('on_screen_text', 'Lower-thirds/callouts', false),
    str('duration_seconds', 'Rough length'),
  ])
  ```
- Remove `sound_effects`/`background_music` from every chapter. Replace with single top-level `audio_direction: string` — "Overall mood/genre guidance; editor selects actual tracks."
- `b_roll_suggestions` on chapters: mark optional with constraint "Only include if source material explicitly suggests visuals."
- Shorten "Before Finishing" from 10 items to 6.

**4b. Engagement.**
- Replace YAML-style Twitter thread example (~30 lines) with 8-line JSON example.
- Dedupe "No fabricated stats" (currently in principles + rules.content).

**4c. Blog.**
- `full_draft` markdown allowlist in rules.content: "Allowed: `## `, `### `, `**bold**`, `*italic*`, `- lists`, `1. numbered`, `> blockquotes`, `[text](url)`. Forbidden: code fences, tables, images, HTML."
- `internal_links_suggested` rule addition: "Max 5 entries. Each must reference a topic explicitly covered in `research.sources[]` — not invented."

**4d. Review (final compression).**
- Per-content-type review sections: drop full example JSON blocks; keep only rubric bullets. Stacks on Theme 2b. Target final: ~320 lines.

**Criteria impact:**
- Video crit 7: 6→8, crit 9: 6→8, crit 13: 7→9
- Engagement crit 7: 7→9, crit 11: 8→9
- Blog crit 5: 7→9, crit 13: 7→9
- Review crit 7: 7→8

### Theme 5 — Content Core + Shorts + fleet cleanup

**Work:**

**5a. Content Core.**
- `cta_subscribe`/`cta_comment_prompt` rule: "Derive from `closing_emotion` input + channel context. Do not introduce topics not in thesis."
- Dedupe 4 residual lines in "Before Finishing".
- Add explicit JSON-escape reminder for `thesis` and `argument_chain[].explanation` long strings.

**5b. Shorts.**
- Dedupe `visual_style` — currently described 4x. Keep only enum definition + one usage rule.
- Review Shorts section adds: "Assess `visual_style` consistency across the 3 shorts — same tone, not random mix."

**5c. Cross-fleet cleanups.**
- Every agent's "Before Finishing" contains only verification steps. Zero formatting reminders (those live in `STANDARD_JSON_RULES`).
- Grep invariant: `scripts/agents/*.ts` (excluding `_helpers.ts`) returns zero matches for "No em-dashes", "No curly quotes", "JSON parseable".
- Add shared `content_warning` helper in `_helpers.ts` so every agent declares it identically.
- Run `npm run db:seed` after all prompt changes to regenerate `supabase/seed.sql`.

**Criteria impact:**
- Content Core crit 3: 8→9, crit 7: 8→9
- Shorts crit 11: 8→9

### Theme 6 — Honest reframing of fabrication-prone fields

**Principle:** Don't remove features; reframe fields so users see speculation as speculation. Prevents trust damage from plausible-but-fake output.

**Work:**

**6a. Brainstorm — `monetization` → `monetization_hypothesis`.**
- Rename field in output schema.
- Update field description: "Directional hypotheses only. AI cannot verify brand fit or sponsor appeal."
- UI label in `BrainstormEngine`: "AI speculation — verify before outreach."

**6b. Podcast — `personal_angle` → `host_talking_prompts: string[]`.**
- Restructure from single first-person string to array of invitation prompts.
- Phrasing rule: "Frame as 'Share a time when…' or 'The host might describe…' — never fabricate first-person experience."
- UI: render as bullet list labeled "Prompts for the host to personalize."

**6c. Research — URLs preserved.**
- No change (user reports URLs accurate in practice).

**Criteria impact:**
- Brainstorm crit 13: 9→10 (additional +1 atop Theme 3)
- Podcast crit 6: 9→10, crit 13: 7→9

---

## Projected Final Scores

| Agent | Current | T1 | T2 | T3 | T4 | T5 | T6 | **Final** |
|-------|---------|----|----|----|----|-----|-----|-----------|
| Brainstorm | 7.1 | — | — | +0.8 | — | — | +0.1 | **~8.0** ⚠ |
| Research | 7.5 | — | — | +0.9 | — | — | — | **~8.4** ⚠ |
| Content Core | 8.2 | — | — | — | — | +0.2 | — | **~8.4** ⚠ |
| Blog | 7.7 | +0.2 | — | — | +0.3 | — | — | **~8.2** ⚠ |
| Video | 7.2 | +0.3 | — | — | +0.5 | — | — | **~8.0** ⚠ |
| Shorts | 8.0 | +0.2 | — | — | — | +0.1 | — | **~8.3** ⚠ |
| Podcast | 7.5 | +0.2 | — | +0.2 | — | — | +0.3 | **~8.2** ⚠ |
| Engagement | 7.8 | +0.2 | — | — | +0.2 | — | — | **~8.2** ⚠ |
| Review | 7.0 | +0.2 | +1.2 | — | +0.1 | — | — | **~8.5** ✓ |

**Honest projection:** Only Review hits 8.5 with these 6 themes. Others land 8.0-8.4.

**To guarantee 8.5 floor**, each agent below target needs ~2-4 additional criterion boosts, each averaging +1 point. This is tractable but requires a second audit pass post-implementation to identify which specific criteria can move. Options:

- **Ship Themes 1-6, re-audit, close remaining gaps in a Theme 7** (iterative). Recommended — real scoring after implementation may exceed projections (projections are conservative).
- **Pre-plan Theme 7 now** (speculative) — risks designing against phantom gaps that disappear after real implementation shifts scores.

**Recommendation: ship 1-6, re-audit, then Theme 7 if needed.**

---

## Test Plan

- **Unit:** mapper round-trip tests in `packages/shared/src/mappers/__tests__/pipeline.test.ts` — every Theme 1 field survives end-to-end.
- **Schema:** Zod schema tests for new Review output shape (`quality_tier`, `rubric_checks`).
- **Prompt integrity:** grep invariants (zero Portuguese, zero duplicated formatting rules outside `_helpers.ts`).
- **Integration:** run each agent against a fixture project, confirm output validates against updated schemas.
- **UI smoke:** `ReviewEngine`, `BrainstormEngine`, `PipelineOrchestrator` render new field shapes without runtime errors.
- **Re-audit:** regenerate the 13-criterion audit against post-implementation prompts. Compare to projections.

---

## Risks

1. **Review loop threshold change** — moving orchestrator from `score >= 90` to `quality_tier in ('excellent', 'good')` affects auto-pilot behavior. Existing projects mid-pipeline with persisted `pipeline_state_json` may have numeric score — the display layer handles both for 30 days per legacy format policy, but orchestrator logic needs explicit dual-read.
2. **Mapper changes ripple to tests and consumers** — any downstream code reading only the old subset will break when new fields appear. Confirmed consumer audit needed before Theme 1.
3. **Projected scores are estimates** — real scoring may differ. Theme 7 (iterative close) mitigates.
4. **Seed regeneration** — `npm run db:seed` resets local DB. Devs need to be warned or the script updated to preserve local data.

---

## Out of Scope

- Additional AI capability (e.g., giving Research live web access for URL verification).
- Re-architecting the 5-stage pipeline itself.
- UI redesign of engines beyond the minimum needed for renamed fields.
- Retiring legacy numeric `score` reads after 30-day compatibility window (separate cleanup).
