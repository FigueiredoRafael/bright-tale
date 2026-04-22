# Agent Fleet 8.5+ — Plan B Design Spec

**Date:** 2026-04-22
**Status:** draft
**Baseline:** `docs/agent-prompt-audit-post-plan-a.md` (fleet avg 8.04 per re-audit)
**Goal:** All 9 agents ≥ 8.5 on the 13-criterion audit. Brainstorm accepted at ~8.3 with explicit iteration note (T6 follow-up).
**Scope:** Agent prompts (`scripts/agents/*.ts`) + `_helpers.ts` + Review output consumers (`ReviewEngine`, `CompletedStageSummary`) + Research mapper.

---

## Problem

Plan A shipped Themes 1, 2, 6 and moved fleet avg from 7.6 → 8.04. Residual gaps (per fresh audit):

1. **Missing `content_warning` field** in Blog, Video, Shorts, Podcast, Engagement (Crit 6 — failure guardrails). Five agents still invite padded prose when input is thin.
2. **CustomSections redundancy** fleet-wide (Crit 7, 11 — token budget, redundancy). "Before Finishing" checklists duplicate `rules.validation`; Field Guidance restates `rules.content` with examples. Worst offenders: Video (312 lines), Review (400 lines), Content-Core (227 lines).
3. **Hallucination surfaces** still present (Crit 13). Brainstorm `product_categories` is unvalidated string array ("Nike" can still slip through). Shorts/Engagement lack explicit stats fallback. Video config metrics (`cut_frequency`, `b_roll_density`, `text_overlays`) are vague without benchmarks (Crit 5).
4. **Research doesn't echo input constraints** (Crit 2, 4). `research_focus` and `depth` aren't reflected in output, so downstream can't verify scope. `secondary_keywords` are bare strings with no source attribution.
5. **UX still renders `score/100`** (`CompletedStageSummary`) despite Plan A moving to `quality_tier`. `ReviewEngine` synthesizes numeric score from tier but doesn't show the tier itself.

Plan B closes these surgically. No architecture changes.

---

## Per-Agent Targets

| Agent         | Now (re-audit) | Target | Gap  | Primary lift |
|---------------|---------------|--------|------|--------------|
| Brainstorm    | 7.9           | 8.5    | +0.6 | T3 (product_categories enum) — accepts 8.3; iteration after |
| Research      | 8.2           | 8.5    | +0.3 | T4 (echo + secondary_keywords shape) |
| Content-Core  | 8.2           | 8.5    | +0.3 | T2 (compression 227→120) |
| Blog          | 8.2           | 8.5    | +0.3 | T1 (content_warning) + T2 |
| Video         | 7.6           | 8.5    | +0.9 | T2 (312→180) + T3 (metrics benchmarks) |
| Shorts        | 8.1           | 8.5    | +0.4 | T1 + T3 (stats fallback) |
| Podcast       | 8.2           | 8.5    | +0.3 | T1 + T2 |
| Engagement    | 8.0           | 8.5    | +0.5 | T1 + T2 + T3 |
| Review        | 8.2           | 8.5    | +0.3 | T2 (400→250) |

---

## Architecture — 5 Themes

Work organized for parallelizability. T1 and T3 are additive (no blocking). T2 is mechanical prose trimming. T4 is isolated to Research. T5 is UI-only.

**Implementation order:**
1. **T1** (`content_warning` fleet-wide) — adds fields referenced by later themes.
2. **T3** (hallucination guards) — schema/enum additions, parallel-safe with T1.
3. **T2** (compression) — needs T1/T3 fields landed before rules.validation can reference them.
4. **T4** (Research echo + keyword shape) — isolated; mapper change requires 30-day compat shim.
5. **T5** (UX polish) — consumes Plan A's existing `quality_tier`/`rubric_checks`; no upstream deps.

---

### T1 — `content_warning` fleet-wide

**Problem:** Five agents (Blog, Video, Shorts, Podcast, Engagement) lack a declared fallback field when research depth is insufficient. Rules say "don't fabricate" but provide no structured output slot for "material too thin."

**Work:**

1. Extract shared helper in `scripts/agents/_helpers.ts`:
   ```typescript
   export const contentWarningField = () =>
     str(
       'content_warning',
       'Set if input material is insufficient. Format: "Missing X — padding avoided." Leave empty when content is complete.',
       false,
     );
   ```
2. Add `contentWarningField()` to outputSchema of:
   - `scripts/agents/blog.ts` — rule tie: "If `research.sources` count is below `depth`-implied minimum OR `key_stats` is empty while body needs supporting data, populate `content_warning` instead of extending prose."
   - `scripts/agents/video.ts` — rule tie: "If `teleprompter_script` source material is thin for the target duration, populate `content_warning` instead of repeating points."
   - `scripts/agents/shorts.ts` — rule tie: "If `key_stats` is empty or input provides insufficient hooks for 3 distinct shorts, populate `content_warning`."
   - `scripts/agents/podcast.ts` — rule tie: "If `key_quotes` is empty or material won't sustain `duration_estimate`, populate `content_warning`."
   - `scripts/agents/engagement.ts` — rule tie: "If `key_stats` is empty and thread requires quantitative claims, populate `content_warning`."
3. Refactor Brainstorm and Research to use the same helper (they already declare `content_warning` inline — collapse to helper for consistency).

**Criteria impact:** Crit 6 +1-2 per affected agent (5 agents).

---

### T2 — CustomSections compression

**Problem:** "Before Finishing" checklists duplicate `rules.validation`. Field Guidance sections restate `rules.content` with examples. Total fleet customSection waste ~900 lines.

**Work:**

**Fleet-wide rule:** Merge every "Before Finishing" block into `rules.validation`. Delete the customSection entry. Field Guidance sections may stay but cap at ONE example per field (not 2-3).

Per-agent targets (aspirational, not strict):

**T2a — Video (`scripts/agents/video.ts`, current ~312 lines → target ~180):**
- Drop "Before Finishing" (10 items) → merge into `rules.validation`.
- Collapse 8 Field Guidance subsections to 4 inline examples inside `rules.content`.
- Consolidate per-chapter `sound_effects` + `background_music` into single top-level `audio_direction: string` rule: "Overall mood/genre; editor selects tracks."
- Mark `b_roll_suggestions` optional with constraint "Only if source material explicitly suggests visuals."

**T2b — Review (`scripts/agents/review.ts`, current ~611 lines → target ~250):**
- Per-content-type review sections (`blog_review`, `video_review`, `shorts_review`, `podcast_review`, `engagement_review`): drop full-example JSON blocks; keep rubric bullets only.
- "Before Finishing" → merge into `rules.validation`.
- Consolidate 7 Field Guidance subsections into 1 "Rubric Application" block (~30 lines).

**T2c — Content-Core (`scripts/agents/content-core.ts`, current ~227 lines → target ~120):**
- 11 customSections → 4. Dedupe 4 residual lines in "Before Finishing" → merge into `rules.validation`.
- Keep `cta_subscribe`/`cta_comment_prompt` derivation rule prominent (don't remove).

**T2d — Podcast (`scripts/agents/podcast.ts`, current ~177 lines → target ~120):**
- 4 Field Guidance blocks (95 lines) → inline examples in `rules.content`.
- "Before Finishing" (7 lines) → merge into `rules.validation`.

**T2e — Engagement (`scripts/agents/engagement.ts`, current ~174 lines → target ~90):**
- YAML-style Twitter thread example (~30 lines) → 8-line JSON example.
- Dedupe "No fabricated stats" (appears in principles + rules.content — pick one).
- "Before Finishing" → merge into `rules.validation`.

**Criteria impact:** Crit 7, 11 +2 per agent (5 agents).

---

### T3 — Hallucination guards

**Problem:** Residual fabrication surfaces despite Plan A's guards.

**Work:**

**T3a — Brainstorm `product_categories` (`scripts/agents/brainstorm.ts`):**
- Add validation rule to `rules.content`: "`monetization_hypothesis.product_categories[]` values MUST match pattern `^[a-z ]+(brands|tools|platforms|services|products|apparel|gear|software|equipment)$`. Never specific company names. Reject examples: 'Nike', 'Shopify', 'Adobe'. Accept examples: 'outdoor gear brands', 'SaaS productivity tools', 'B2B analytics platforms'."
- This is a prompt-level rule; schema stays `string[]`. Regex enforcement at mapper level deferred (over-engineering for current value).

**T3b — Shorts stats fallback (`scripts/agents/shorts.ts`):**
- Add to `rules.content`: "If input `key_stats` is empty, every short MUST use qualitative framing derived from `thesis`. Never paraphrase an invented number as fact. If a short's hook requires a stat and none is in input, populate `content_warning` and skip that short's stat — keep the hook qualitative."

**T3c — Engagement stats tightening (`scripts/agents/engagement.ts`):**
- Replace current rule "supported by a stat...where possible" with: "Every quantitative claim in the thread MUST cite a figure from input `key_stats[].figure`. Qualitative claims only allowed when no stat fits the point. Never invent percentages, dates, or counts."

**T3d — Video config metrics (`scripts/agents/video.ts`):**
- Add benchmark definitions to `rules.content`:
  - `cut_frequency`: `slow` = 1 cut per 8-10s, `moderate` = 2-3 cuts per 10s, `fast` = 5+ cuts per 10s, `variable` = scene-driven, `action_based` = beat-matched.
  - `text_overlays`: `heavy` = every stat + major claim opening, `moderate` = key claims only, `light` = opener + closer only, `none` = no overlays.
  - `b_roll_density`: `low` = <20% screen time on b-roll, `moderate` = 20-50%, `heavy` = >50%.
- These are prompt descriptions; enum values in `production.video` schema already exist (`cut_frequency`, `b_roll_density`, `text_overlays` strings). Rule makes the values meaningful.

**Criteria impact:** Brainstorm 13 +1; Shorts 13 +1; Engagement 13 +1; Video 5 +1, Video 13 +1.

---

### T4 — Research handoff echo + keyword shape

**Problem:** Research output doesn't reflect input constraints (`research_focus`, `depth`), so Content-Core and Blog can't verify scope. `secondary_keywords: string[]` with no source attribution invites fabrication.

**Work:**

**T4a — Echo input constraints (`scripts/agents/research.ts`):**
- Add to `outputSchema`:
  - `str('research_focus_applied', 'Echo of input research_focus. Must match exactly.')`
  - Enum field `depth_applied` with values `'shallow' | 'standard' | 'deep'`. Must match input `depth`.
- Add to `rules.validation`: "`research_focus_applied` MUST equal input `research_focus`. `depth_applied` MUST equal input `depth`. These are programmatic echoes, not commentary."

**T4b — Secondary keywords with source attribution:**
- Change `seo.secondary_keywords` schema in `research.ts` from `string[]` to:
  ```typescript
  arrOf('secondary_keywords', 'Keywords with source attribution', [
    str('keyword', 'The keyword phrase'),
    str('source_id', 'Must match an entry in sources[]'),
  ])
  ```
- Update `packages/shared/src/mappers/pipeline.ts`:
  - `mapResearchToContentInput`: extract `keyword` string from new shape for consumers expecting `string[]`.
  - Add `legacyKeywordFallback()` helper: accepts either `string[]` (legacy) or `{keyword, source_id}[]` (new), returns `string[]`. 30-day compat window.
- Update `__tests__/pipeline.test.ts`: round-trip test both shapes.

**T4c — Additional Plan A Theme 3a additions:**
- Add domain preference rule to `rules.content`: "Prefer well-known domains (.edu, .gov, major publications, Wikipedia) when choosing sources."
- `statistics[].figure` rule: "Only include stats with source attribution matching an entry in `sources[]`. No standalone figures."

**Criteria impact:** Research 2 +1, 4 +1, 13 +1.

---

### T5 — UX polish

**Problem:** Plan A moved Review to `quality_tier`/`rubric_checks` but UI layer still renders numeric `score/100`. `ReviewEngine` synthesizes score from tier for the orchestrator gate but doesn't show the tier to users.

**Work:**

**T5a — `ReviewEngine` tier badge (`apps/app/src/components/engines/ReviewEngine.tsx`):**
- Replace "Score: X / 100" rendering with:
  - Tier badge component (pill) showing `quality_tier` value with color coding: `excellent` (green), `good` (blue), `needs_revision` (amber), `reject` (red), `not_requested` (gray).
  - Expandable sections for `rubric_checks.critical_issues[]` (red), `rubric_checks.minor_issues[]` (amber), `rubric_checks.strengths[]` (green).
- Keep internal `legacyScoreFromTier` map for the orchestrator's numeric gate (don't touch `PipelineOrchestrator` numeric compare).
- Legacy reviews (numeric `score`, no `quality_tier`): use `deriveTier()` to infer tier for display, fall back to score/100 if `score` present and `quality_tier` absent.

**T5b — `CompletedStageSummary` (`apps/app/src/components/pipeline/CompletedStageSummary.tsx`):**
- Detect new-shape via `deriveTier()` from `@brighttale/shared`.
- If tier resolves to a real value (not `not_requested`), render tier badge.
- Fall back to numeric `score/100` for legacy reviews (30-day window).

**No new dependencies.** Uses existing `deriveTier`/`isApprovedTier` from `packages/shared/src/utils/reviewTierCompat.ts`.

---

## Test Plan

- **Unit (schemas):** Zod additions — `content_warning` in 5 new agents, Research `secondary_keywords` new shape, `research_focus_applied`, `depth_applied`. All validated in `packages/shared/src/schemas/__tests__/`.
- **Mapper:** `packages/shared/src/mappers/__tests__/pipeline.test.ts` — Research new keyword shape round-trips both ways (legacy string[] → new objects → legacy string[]).
- **Prompt integrity grep invariants** (run in `scripts/verify-prompts.sh` or CI):
  - `scripts/agents/*.ts` excluding `_helpers.ts` returns ZERO matches for `"Before Finishing"`.
  - ZERO matches for `"No em-dashes"`, `"No curly quotes"`, `"JSON parseable"` outside `_helpers.ts`.
  - Every agent with a `content_warning` field uses `contentWarningField()` helper (no inline duplicates).
- **Line count ceilings** (soft targets, not enforced by lint):
  - Video < 200 lines, Review < 260 lines, Content-Core < 120, Podcast < 120, Engagement < 100.
- **Contract test:** `packages/shared/src/mappers/__tests__/agentContracts.test.ts` extended to assert `content_warning` appears in Blog/Video/Shorts/Podcast/Engagement outputSchemas.
- **UI smoke:**
  - `ReviewEngine` renders tier badge for new-shape review.
  - `CompletedStageSummary` renders tier badge for new, score/100 for legacy.
  - Orchestrator still pauses on `reject` (synthesized score 20 < 40 threshold).
- **Re-audit:** run the 13-criterion auditor subagent post-implementation. Compare actual vs projected 8.5+ fleet scores.

---

## Risks

1. **Compression cuts necessary content.** Mitigated by: one-example-per-section rule (not zero); `rules.content` remains authoritative; line-count targets are aspirational not strict; reviewer subagent spot-checks compressed prompts against original for semantic preservation.
2. **Secondary_keywords shape change breaks downstream.** Consumers: `Content-Core` and `Blog` read `research.seo.secondary_keywords[]`. `legacyKeywordFallback()` helper coerces both shapes to `string[]` for 30-day compat. Removal of compat scheduled for 2026-05-22 (~30 days post-merge).
3. **Brainstorm `product_categories` regex rule is prompt-level, not schema-level.** Model can still violate. Acceptable risk for Plan B (schema enforcement = Plan C / iteration). Documented as follow-up.
4. **Video line-count target of 180 is aggressive** given current 312. If compression produces unclear prompts, target is relaxed to 220 with reviewer approval.
5. **UI changes in T5 require testing against legacy reviews.** Mitigated by dual-read via `deriveTier()`; manual smoke test plan required before merge.

---

## Out of Scope

- Schema-level enforcement of Brainstorm `product_categories` regex (deferred — iteration after Plan B re-audit).
- Retiring legacy numeric `score` reads or legacy `string[]` keyword reads after 30-day window (separate cleanup card).
- Plan A Theme 4c Blog markdown allowlist + internal_links cap (already covered by existing Blog prompt; re-verify during T2c if time permits but not mandatory).
- Any agent logic beyond prompt text (prompt builder, API routes, DB schema).
- Performance optimization of prompt-token costs beyond natural byproducts of compression.

---

## Post-Plan B

- Run re-audit subagent. Verify fleet ≥ 8.5 on every agent except Brainstorm (accepted 8.3).
- If Brainstorm residual gap persists: Plan C = single-agent iteration on Brainstorm (schema-level `product_categories` enforcement + additional content_warning coverage).
- Remove 30-day compat shims on 2026-05-22: legacy numeric `score` reads, legacy `string[]` secondary_keywords reads, legacy `personal_angle` podcast string reads.
