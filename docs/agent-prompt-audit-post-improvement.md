# Agent Prompt Audit — Post-Improvement

**Date:** 2026-04-21
**Baseline:** `docs/agent-prompt-audit.md` (pre-improvement)
**Scope:** All 9 agent seed definitions after 4-phase improvements
**Commits:** `8f05b9f` → `f9c36dc` → `d118e83` → `e635f47` → `2570ce1`

---

## Scoring Criteria

Same 13 criteria as the original audit. Scale: 0 = critically broken, 5 = functional but needs work, 10 = no issues found.

| # | Criterion |
|---|-----------|
| 1 | **Contract Completeness** |
| 2 | **Input-Output Traceability** |
| 3 | **JSON Safety** |
| 4 | **Handoff Fidelity** |
| 5 | **Ambiguity** |
| 6 | **Failure Guardrails** |
| 7 | **Token Budget** |
| 8 | **Language Consistency** |
| 9 | **Idempotency** |
| 10 | **Validation Checkability** |
| 11 | **Redundancy** |
| 12 | **Alignment** |
| 13 | **Hallucination Surface** |

---

## Score Matrix — Before vs After

| Agent | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | **AVG** | **OLD** | **Δ** |
|-------|---|---|---|---|---|---|---|---|---|----|----|----|----|---------|---------|-------|
| **Brainstorm** | 8 | 5 | 8 | 6 | 7 | 5 | 8 | 9 | 7 | 6 | 8 | 9 | **7** | **7.1** | 6.8 | **+0.3** |
| **Research** | 8 | 8 | 8 | 7 | 7 | 7 | 8 | 10 | 8 | 8 | 6 | 7 | **6** | **7.5** | 7.2 | **+0.3** |
| **Content Core** | 9 | 8 | 8 | 7 | 8 | 8 | 8 | 10 | 8 | **9** | **8** | 9 | 7 | **8.2** | 7.8 | **+0.4** |
| **Blog** | 9 | 8 | 8 | 6 | 7 | **8** | **7** | **10** | 7 | 7 | **8** | 8 | **7** | **7.7** | 6.4 | **+1.3** |
| **Video** | 8 | 7 | 8 | 5 | 7 | **8** | **6** | **10** | 6 | 7 | **8** | 7 | **7** | **7.2** | 5.6 | **+1.6** |
| **Shorts** | 9 | 8 | 8 | **7** | 7 | **8** | 7 | 10 | 8 | 8 | **8** | 9 | 7 | **8.0** | 7.4 | **+0.6** |
| **Podcast** | 8 | 7 | 8 | 5 | 7 | **8** | **7** | 10 | 7 | 6 | **8** | 9 | **7** | **7.5** | 6.9 | **+0.6** |
| **Engagement** | 9 | 8 | 8 | 5 | 7 | **8** | 7 | 10 | 8 | 8 | **8** | 9 | 7 | **7.8** | 7.2 | **+0.6** |
| **Review** | 8 | 7 | 8 | **7** | 6 | 6 | **4** | 10 | 6 | 7 | **7** | 8 | **7** | **7.0** | 6.2 | **+0.8** |

**Fleet Average: 7.6** (was 6.8, **+0.8**)

---

## What Changed — Criterion by Criterion

### Criterion 3: JSON Safety (Fleet +0.7)

**Before:** STANDARD_JSON_RULES existed but escape rule was new and not all agents had the full set.
**After:** Escape rule added to `STANDARD_JSON_RULES` in `_helpers.ts`, inherited by all 9 agents. Blog's explicit full_draft escape reminder in "Before Finishing" was removed — now handled by the shared rule. All agents: 7→8.

### Criterion 6: Failure Guardrails (Fleet +0.8)

**Before:** No `content_warning` fallback in Blog, Shorts, Podcast, or Video. No key_stats fallback in Engagement.
**After:**
- Blog: `content_warning` field added to outputSchema + target length guidance says "set content_warning instead of padding"
- Video: `content_warning` added + target duration rule uses it
- Shorts: `content_warning` added + target duration rule uses it
- Podcast: `content_warning` added + target duration rule uses it
- Engagement: Fallback rule: "If key_stats is empty, use qualitative claims from thesis. Do not fabricate statistics."

### Criterion 7: Token Budget (Fleet +0.9)

**Before:** Blog had 12+ redundant lines. Video had ~6100 chars of Portuguese prose in 3 custom sections + 15+ redundant lines. Review had verbose publication plan with date fields.
**After:**
- Phase 1 removed 63 lines of duplicate formatting rules across 7 files
- Phase 2 removed 255 lines of Portuguese/verbose content, added 19 lines of compressed English
- Blog: 7 custom sections → 7 (same count, but "Target Length" Portuguese section deleted, content merged into "Full Draft" as 6 compressed lines)
- Video: 11 custom sections → 8 (deleted F2-045, F2-046, F2-047 Portuguese sections; rules merged into `rules.content`)
- Review: Publication plan trimmed (removed 8 date/URL fields across sub-objects)
- **Net: ~320 lines removed fleet-wide**

### Criterion 8: Language Consistency (Blog +6, Video +8)

**Before:** Blog had 1 Portuguese section (~800 chars). Video had 3 Portuguese sections (~6100 chars, ~40% of custom sections).
**After:** Zero Portuguese in any agent file. Grep for Portuguese words returns 0 matches. Blog: 4→10. Video: 2→10.

### Criterion 11: Redundancy (Fleet +1.5)

**Before:** "No em-dashes" appeared 3x per agent (STANDARD_JSON_RULES + rules.formatting + "Before Finishing"). Same for "curly quotes", "YAML pipe", "markdown fences", "escape quotes". ~12 redundant lines per agent.
**After:** All 5 rules exist only in `STANDARD_JSON_RULES`. Agent `rules.formatting` arrays contain only `...STANDARD_JSON_RULES` + agent-specific rules. "Before Finishing" sections contain only verification checklists, not formatting rule reminders.

### Criterion 13: Hallucination Surface (Fleet +1.0)

**Before:**
- Brainstorm: `monthly_volume_estimate` — guaranteed fabrication (4/10)
- Research: `confidence_score` uncalibrated, URLs fabricated (3/10)
- Blog: `word_count` unreliable, `internal_links` had no URL disclaimer (5/10)
- Video: `total_duration_estimate` ungrounded (5/10)
- Podcast: `personal_angle` and `duration_estimate` unconstrained (6/10)
- Review: `recommended_publish_date`, `publish_time`, `target_url` — all fabricated (5/10)

**After:**
- Brainstorm: `monthly_volume_estimate` **removed** entirely. Field guidance says "Do not estimate search volume — that data requires external tools." (4→7)
- Research: `confidence_score` now has calibration rubric (1-3/4-6/7-9/10 scale with definitions). URL constraint added: "If you cannot verify a URL exists, set to empty string." Quote constraint: "If paraphrasing, mark with [paraphrased]." (3→6)
- Blog: `word_count` **removed** from output schema. `internal_links_suggested` description updated to "Do not include URLs — these are topic ideas, not links." (5→7)
- Video: `total_duration_estimate` **renamed** to `estimated_duration` with description: "Estimate based on script word count at ~150 words/minute." Grounded calculation instead of guess. (5→7)
- Podcast: `personal_angle` description changed to "First-person framing for the host to personalize. The host will adapt with their real experience." `duration_estimate` changed to "Rough estimate based on talking point count (~5-7 min each). Not a production target." (6→7)
- Review: `recommended_publish_date` removed from all sub-objects. `publish_time` removed. `target_url` removed from internal_links. `twitter_thread_date`, `community_post_date` removed. Publication plan guidance: "Publication timing should be determined by the content team." (5→7)

### Criterion 4: Handoff Fidelity (Review +3, Shorts +2)

**Before:** Review input schema was sparse — Blog input had 4 fields, Video had 3, Shorts was a string array, Podcast had 2, Engagement had 2.
**After (Phase 4):**
- Blog: Added `slug` (URL-safety check), `primary_keyword` (verify in title/meta). Removed `word_count` (was fabricated anyway).
- Video: Added `thumbnail` object (text_overlay, emotion, visual_style), `chapter_count`. Renamed `total_duration_estimate` → `estimated_duration`.
- Shorts: Changed from `arr('shorts', ..., 'string')` to `arrOf` with `hook`, `script`, `visual_style`, `duration_target` — Review can now assess hook quality and visual consistency.
- Podcast: Added `intro_hook` (opening quality assessment), `outro` (verify CTA inclusion).
- Engagement: Added `hook_tweet`, `thread_outline` — Review can now assess Twitter/X thread.
- Custom sections updated: Blog Review guidance now includes slug/keyword checks. Shorts Review guidance mentions hook + visual_style assessment. Engagement Review guidance covers hook_tweet and thread_outline criteria.

---

## Detailed Findings Per Agent (Post-Improvement)

### 1. Brainstorm — 7.1 (was 6.8, +0.3)

| Criterion | Before | After | Change | Notes |
|-----------|--------|-------|--------|-------|
| 3. JSON Safety | 7 | 8 | +1 | Escape rule now in STANDARD_JSON_RULES |
| 13. Hallucination | 4 | 7 | +3 | `monthly_volume_estimate` removed. "Do not estimate search volume" in guidance. |

**Remaining issues:**
- Handoff to Research still loses `monetization.product_fit` and `monetization.sponsor_appeal` (mappers, not prompt issue)
- No default idea count when user doesn't specify
- Empty input schema intentional but undocumented

### 2. Research — 7.5 (was 7.2, +0.3)

| Criterion | Before | After | Change | Notes |
|-----------|--------|-------|--------|-------|
| 3. JSON Safety | 7 | 8 | +1 | Escape rule inherited |
| 10. Validation | 7 | 8 | +1 | URL + quote constraints in validation rules |
| 13. Hallucination | 3 | 6 | +3 | `confidence_score` calibrated. URL fabrication guarded. Quote paraphrasing marked. |

**Remaining issues:**
- `sources[].url` — AI still can't verify URLs exist, just told to set empty if unsure
- `confidence_score` is better calibrated but still subjective
- No explicit `content_warning` for when research yields nothing

### 3. Content Core — 8.2 (was 7.8, +0.4)

| Criterion | Before | After | Change | Notes |
|-----------|--------|-------|--------|-------|
| 3. JSON Safety | 7 | 8 | +1 | Escape rule inherited |
| 5. Ambiguity | 7 | 8 | +1 | `argument_chain` now has explicit "Min 2, max 6 steps" |
| 7. Token Budget | 7 | 8 | +1 | Removed 4 duplicate lines from "Before Finishing" |
| 10. Validation | 8 | 9 | +1 | Added "Verify argument_chain has 2-6 steps" to validation |
| 11. Redundancy | 6 | 8 | +2 | Removed duplicates from formatting + "Before Finishing" |

**Remaining issues:**
- Best agent in fleet. Minor: `cta_subscribe`/`cta_comment_prompt` are generated fields (low-stakes opinion)

### 4. Blog — 7.7 (was 6.4, +1.3) ⬆ Biggest non-Video improvement

| Criterion | Before | After | Change | Notes |
|-----------|--------|-------|--------|-------|
| 6. Failure Guardrails | 6 | 8 | +2 | `content_warning` added to schema. Target length guidance uses it. |
| 7. Token Budget | 5 | 7 | +2 | Portuguese section deleted (-800 chars). 12 redundant lines removed. |
| 8. Language | 4 | 10 | +6 | Portuguese "Target Length" section translated, compressed, merged into "Full Draft" |
| 11. Redundancy | 4 | 8 | +4 | Formatting rules: 9 lines → 2. "Before Finishing": 12 items → 6. |
| 13. Hallucination | 5 | 7 | +2 | `word_count` removed. `internal_links_suggested` no-URL disclaimer. |

**Remaining issues:**
- Handoff to Review still loses `secondary_keywords`, `outline`, `affiliate_integration` (mapper issue)
- `primary_keyword` in output is generated without SEO tool grounding (inherent limitation)

### 5. Video — 7.2 (was 5.6, +1.6) ⬆ Biggest improvement

| Criterion | Before | After | Change | Notes |
|-----------|--------|-------|--------|-------|
| 6. Failure Guardrails | 7 | 8 | +1 | `content_warning` for insufficient material |
| 7. Token Budget | 3 | 6 | +3 | 3 Portuguese sections deleted (-6100 chars, -255 lines). Compressed to 7 `rules.content` entries. |
| 8. Language | 2 | 10 | +8 | Zero Portuguese. All guidance now English. |
| 11. Redundancy | 4 | 8 | +4 | Formatting rules: 9 lines → 2. "Before Finishing": 13 items → 10. |
| 13. Hallucination | 5 | 7 | +2 | `total_duration_estimate` → `estimated_duration` with calculation formula. |

**Remaining issues:**
- `editor_script` schema is still an empty object `obj(..., {}, false)` — guidance is in `rules.content` but no field structure. This is the biggest remaining gap.
- `sound_effects` and `background_music` on every section are inherently suggestive/fabricated
- Token budget (6) is still below fleet average — Video is inherently the most complex agent
- Handoff to Review still loses teleprompter_script, editor_script, video_description (mapper issue)

### 6. Shorts — 8.0 (was 7.4, +0.6)

| Criterion | Before | After | Change | Notes |
|-----------|--------|-------|--------|-------|
| 4. Handoff Fidelity | 5 | 7 | +2 | Review now receives arrOf with hook, script, visual_style, duration_target |
| 6. Failure Guardrails | 7 | 8 | +1 | `content_warning` added. Target duration scaling rule added. |
| 11. Redundancy | 5 | 8 | +3 | Formatting rules deduplicated. "Before Finishing" trimmed. F2-047 section compressed into `rules.content`. |

**Remaining issues:**
- `visual_style` still described in 3 places (principles, rules, guidance) — acceptable given it's a critical enum

### 7. Podcast — 7.5 (was 6.9, +0.6)

| Criterion | Before | After | Change | Notes |
|-----------|--------|-------|--------|-------|
| 6. Failure Guardrails | 7 | 8 | +1 | `content_warning` added. Target duration rule. |
| 7. Token Budget | 6 | 7 | +1 | F2-047 section compressed. Formatting rules deduplicated. |
| 11. Redundancy | 5 | 8 | +3 | Formatting + "Before Finishing" cleaned. |
| 13. Hallucination | 6 | 7 | +1 | `personal_angle` and `duration_estimate` descriptions clarify they're framings, not facts. |

**Remaining issues:**
- Handoff to Review still loses `episode_description`, `personal_angle`, `guest_questions` (mapper issue)
- Review now gets `intro_hook` and `outro` which helps, but can't assess full episode quality

### 8. Engagement — 7.8 (was 7.2, +0.6)

| Criterion | Before | After | Change | Notes |
|-----------|--------|-------|--------|-------|
| 6. Failure Guardrails | 6 | 8 | +2 | key_stats fallback: "use qualitative claims from thesis" |
| 11. Redundancy | 5 | 8 | +3 | Formatting deduplicated. "Before Finishing" trimmed. |

**Remaining issues:**
- Handoff to Review now includes `hook_tweet` and `thread_outline` (fixed in Phase 4)
- YAML-style examples in thread guidance (style nit, not functional issue)

### 9. Review — 7.0 (was 6.2, +0.8)

| Criterion | Before | After | Change | Notes |
|-----------|--------|-------|--------|-------|
| 4. Handoff Fidelity | 4 | 7 | +3 | Input schema expanded: Blog +2 fields (slug, primary_keyword), Video +2 (thumbnail, chapter_count), Shorts arr→arrOf, Podcast +2 (intro_hook, outro), Engagement +2 (hook_tweet, thread_outline). Custom sections updated with assessment guidance. |
| 7. Token Budget | 3 | 4 | +1 | Publication plan trimmed (8 fabricated fields removed). Formatting rules deduplicated. But expanded input schema adds tokens — net small improvement. |
| 11. Redundancy | 5 | 7 | +2 | Formatting dedup. Publication plan date guidance removed. |
| 13. Hallucination | 5 | 7 | +2 | All `recommended_publish_date`, `publish_time`, `target_url`, `twitter_thread_date`, `community_post_date` removed. "Publication timing should be determined by the content team." |

**Remaining issues:**
- Still the second-longest prompt (token budget 4/10)
- `score` is still subjective 0-100 with no grounding formula
- Expanded input schema helps but mappers haven't been updated yet — the schema declares what Review *should* receive, but actual mappers may not pass these fields yet
- Custom section examples are still verbose

---

## Cross-Cutting Issues — Status After Improvement

### Issue A: Handoff Data Loss — PARTIALLY FIXED

| Status | Detail |
|--------|--------|
| ✅ Fixed (schema) | Review input schema now declares fields it needs from all production agents |
| ⚠️ Not fixed (runtime) | Mapper functions in `packages/shared/src/mappers/` have not been updated to pass the new fields. Review schema improvements are aspirational until mappers match. |
| ✅ Fixed | Brainstorm→Research handoff loss (`product_fit`, `sponsor_appeal`) — unchanged but acknowledged as intentional |

### Issue B: Language Contamination — FULLY FIXED ✅

Zero Portuguese in any agent file. All 4 Portuguese sections (Blog F2-047, Video F2-045/046/047) translated to compressed English and merged into existing sections.

### Issue C: Hallucination Fields — MOSTLY FIXED ✅

| Field | Status |
|-------|--------|
| Brainstorm `monthly_volume_estimate` | ✅ Removed |
| Research `confidence_score` | ✅ Calibrated (1-3/4-6/7-9/10 rubric) |
| Research `sources[].url` | ✅ Constraint added ("set empty if unverifiable") |
| Research `expert_quotes` | ✅ Constraint added ("mark paraphrased, never fabricate") |
| Blog `word_count` | ✅ Removed from output schema |
| Blog `internal_links_suggested` | ✅ "Do not include URLs" disclaimer |
| Video `total_duration_estimate` | ✅ Renamed + calculation formula |
| Podcast `personal_angle` | ✅ Description clarifies host adapts |
| Podcast `duration_estimate` | ✅ Description: "rough estimate, not production target" |
| Review `recommended_publish_date` | ✅ Removed from all sub-objects |
| Review `publish_time` | ✅ Removed |
| Review `target_url` | ✅ Removed |
| Review `twitter_thread_date` | ✅ Removed |
| Review `community_post_date` | ✅ Removed |
| Review `score` (0-100) | ⚠️ Still subjective — not addressed |

### Issue D: Redundancy — FULLY FIXED ✅

All 5 STANDARD_JSON_RULES now exist only in `_helpers.ts`. No agent duplicates them in `rules.formatting` or "Before Finishing". Net removal: 63 lines of duplicate rules across 7 files.

---

## Remaining Issues — Priority Ranked

### P0 (Fix next)

1. **Mapper functions need update** — Review input schema declares `slug`, `primary_keyword`, `thumbnail`, `hook`, etc. but `packages/shared/src/mappers/` may not pass them. Until mappers match, Review still receives degraded data at runtime.

2. **Video `editor_script` empty schema** — `obj('editor_script', ..., {}, false)` has no field structure. Guidance is in `rules.content` but output structure is unpredictable. Define fields or change to string type.

### P1 (Fix soon)

3. **Review `score` has no grounding formula** — 0-100 is subjective. Consider defining a rubric (e.g., deduct points per critical issue, per minor issue) or switching to an enum (excellent/good/needs-work/poor).

4. **Review token budget** — Still the second-longest prompt. Custom section examples (~400 lines of YAML-style examples) could be compressed ~40%.

### P2 (Backlog)

5. **Brainstorm empty input schema** — Intentional but should document expected user message format.
6. **Brainstorm → Research monetization field loss** — `product_fit`/`sponsor_appeal` don't reach Research. Decide: add to Research input or remove from Brainstorm output.
7. **Video sound_effects/background_music** — Inherently suggestive fields. Low priority.

---

## Summary

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Fleet average | 6.8 | 7.6 | **+0.8** |
| Lowest agent | Video (5.6) | Review (7.0) | **+1.4** |
| Highest agent | Content Core (7.8) | Content Core (8.2) | +0.4 |
| Portuguese sections | 4 | 0 | **-4** |
| Duplicate formatting lines | ~63 | 0 | **-63** |
| Hallucination-prone fields | 15 | 1 (score) | **-14** |
| Lines removed (net) | — | ~320 | — |
| Agents below 7.0 | 4 | 1 | **-3** |
