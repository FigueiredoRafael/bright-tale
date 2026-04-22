# Agent Fleet 8.5+ Plan B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift all 9 agent prompts to ≥8.5 on the 13-criterion audit (Brainstorm accepted at ~8.3 with iteration note) via surgical prompt edits, shared `content_warning` helper, Research handoff echo, and UX polish that renders `quality_tier` instead of numeric score.

**Architecture:** Five parallelizable themes. T1 adds shared `contentWarningField()` helper in `scripts/agents/_helpers.ts` and extends 4 agents to declare it (four already have inline versions that get migrated to the helper). T2 compresses `customSections` in 5 agents by merging "Before Finishing" blocks into `rules.validation` and collapsing Field Guidance to one example per field. T3 adds hallucination guards (regex rules, stats fallback, Video metric benchmarks). T4 adds Research `research_focus_applied`/`depth_applied` echoes + secondary_keywords source attribution + 30-day `legacyKeywordFallback()` compat. T5 replaces numeric `score/100` rendering with tier badge + rubric_checks sections in `ReviewEngine` and `CompletedStageSummary`.

**Tech Stack:** TypeScript 5 + Zod 3 + Vitest 4. Next.js 16 App Router for UI. Shared types in `packages/shared` consumed at source level (no dist build). Agent prompts are data objects compiled into `supabase/seed.sql` via `scripts/generate-seed.ts`.

---

## File Structure

### Files modified

- `scripts/agents/_helpers.ts` — add `contentWarningField()` helper
- `scripts/agents/blog.ts` — migrate inline content_warning → helper; T2 compress
- `scripts/agents/video.ts` — migrate content_warning → helper; T2 compress; T3d add config metric benchmarks
- `scripts/agents/shorts.ts` — migrate content_warning → helper; T3b stats fallback rule
- `scripts/agents/podcast.ts` — migrate content_warning → helper; T2 compress
- `scripts/agents/engagement.ts` — add content_warning via helper; T2 compress; T3c stats tightening
- `scripts/agents/brainstorm.ts` — add content_warning via helper; T3a product_categories regex
- `scripts/agents/research.ts` — add content_warning via helper; T4a echo fields; T4b keyword shape; T4c domain rule
- `scripts/agents/content-core.ts` — add content_warning via helper; T2 compress
- `scripts/agents/review.ts` — T2 heavy compression (611→~260)
- `packages/shared/src/mappers/pipeline.ts` — add `legacyKeywordFallback()` + new keyword shape handling
- `packages/shared/src/mappers/__tests__/pipeline.test.ts` — keyword shape round-trip test
- `packages/shared/src/mappers/__tests__/agentContracts.test.ts` — assert content_warning in 5 new agents
- `apps/app/src/components/engines/ReviewEngine.tsx` — tier badge + rubric_checks rendering
- `apps/app/src/components/pipeline/CompletedStageSummary.tsx` — tier badge for review stage
- `supabase/seed.sql` — regenerated after prompt changes
- `supabase/migrations/<timestamp>_refresh_agent_prompts_plan_b.sql` — force-reapply migration

### Files created

- `scripts/verify-prompts.sh` — grep invariants (Before Finishing absent, STANDARD_JSON_RULES not duplicated, content_warning uses helper)

---

## Task 1: Add `contentWarningField()` helper

**Files:**
- Modify: `scripts/agents/_helpers.ts`

- [ ] **Step 1: Open helper file and add function**

Add after the `arrOf()` definition (line 46):

```typescript
export const contentWarningField = (purpose = 'material') =>
  str(
    'content_warning',
    `Set if input ${purpose} is insufficient. Format: "Missing X — padding avoided." Leave empty when content is complete.`,
    false,
  );
```

- [ ] **Step 2: Verify no import break**

Run: `npm run typecheck --workspace @brighttale/shared 2>&1 | tail -5`

Expected: no errors in `scripts/agents/_helpers.ts` (the helper is only called, not yet used; compilation should succeed).

- [ ] **Step 3: Commit**

```bash
git add scripts/agents/_helpers.ts
git commit -m "feat(agents): add contentWarningField helper"
```

---

## Task 2: Migrate blog.ts to helper

**Files:**
- Modify: `scripts/agents/blog.ts:85`

- [ ] **Step 1: Import helper**

Locate the import line at the top of `scripts/agents/blog.ts`. Add `contentWarningField` to the import list:

```typescript
import { str, arr, arrOf, obj, STANDARD_JSON_RULES, contentWarningField } from './_helpers';
```

- [ ] **Step 2: Replace inline declaration**

Find line 85:
```typescript
        str('content_warning', 'Set if research material is insufficient for the target word count', false),
```

Replace with:
```typescript
        contentWarningField('research material'),
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @brighttale/shared`

Expected: PASS.

- [ ] **Step 4: Run existing seed script to verify prompts still compile**

Run: `npx tsx scripts/generate-seed.ts --check 2>&1 | tail -5` (If `--check` flag doesn't exist, just run `npx tsx scripts/generate-seed.ts` and verify it doesn't error.)

Expected: generation succeeds.

- [ ] **Step 5: Commit**

```bash
git add scripts/agents/blog.ts
git commit -m "refactor(blog): use contentWarningField helper"
```

---

## Task 3: Migrate video.ts to helper

**Files:**
- Modify: `scripts/agents/video.ts:150`

- [ ] **Step 1: Import helper**

At top of `scripts/agents/video.ts`, add `contentWarningField` to imports:

```typescript
import { str, num, arr, arrOf, obj, STANDARD_JSON_RULES, contentWarningField } from './_helpers';
```

(Adjust the existing import list — keep whatever helpers are already imported.)

- [ ] **Step 2: Replace inline declaration**

Find line 150:
```typescript
        str('content_warning', 'Warning if material is insufficient for target length', false),
```

Replace with:
```typescript
        contentWarningField('material for target length'),
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @brighttale/shared`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/agents/video.ts
git commit -m "refactor(video): use contentWarningField helper"
```

---

## Task 4: Migrate shorts.ts to helper

**Files:**
- Modify: `scripts/agents/shorts.ts:63`

- [ ] **Step 1: Import helper**

At top of `scripts/agents/shorts.ts`, add `contentWarningField` to imports.

- [ ] **Step 2: Replace inline declaration**

Find line 63:
```typescript
        str('content_warning', 'Set if material is insufficient for target duration', false),
```

Replace with:
```typescript
        contentWarningField('material for target duration'),
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @brighttale/shared`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/agents/shorts.ts
git commit -m "refactor(shorts): use contentWarningField helper"
```

---

## Task 5: Migrate podcast.ts to helper

**Files:**
- Modify: `scripts/agents/podcast.ts:69`

- [ ] **Step 1: Import helper**

At top of `scripts/agents/podcast.ts`, add `contentWarningField` to imports.

- [ ] **Step 2: Replace inline declaration**

Find line 69:
```typescript
        str('content_warning', 'Set if material is insufficient for target duration', false),
```

Replace with:
```typescript
        contentWarningField('material for target duration'),
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @brighttale/shared`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/agents/podcast.ts
git commit -m "refactor(podcast): use contentWarningField helper"
```

---

## Task 6: Add content_warning to engagement.ts

**Files:**
- Modify: `scripts/agents/engagement.ts:40-46` (outputSchema), `:47-65` (rules)

- [ ] **Step 1: Import helper**

At top of `scripts/agents/engagement.ts`, add `contentWarningField`:

```typescript
import { str, arr, STANDARD_JSON_RULES, contentWarningField } from './_helpers';
```

- [ ] **Step 2: Add field to outputSchema**

Find the outputSchema fields array (lines 40-46). After the `thread_outline` entry, add:

```typescript
        contentWarningField('key_stats or quantitative material'),
```

- [ ] **Step 3: Add rule to rules.content**

Find line 57 (the existing key_stats fallback rule). After it, add to `rules.content`:

```typescript
        'If key_stats is empty and the thread requires quantitative claims (e.g., hook_tweet needs a stat to land), populate content_warning with "Missing key_stats — qualitative claims only" and use qualitative framing.',
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @brighttale/shared`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/agents/engagement.ts
git commit -m "feat(engagement): add content_warning field and fallback rule"
```

---

## Task 7: Add content_warning to brainstorm.ts

**Files:**
- Modify: `scripts/agents/brainstorm.ts:23-62` (outputSchema), `:63-78` (rules)

- [ ] **Step 1: Import helper**

At top of `scripts/agents/brainstorm.ts`, add `contentWarningField`:

```typescript
import { str, arr, arrOf, obj, STANDARD_JSON_RULES, contentWarningField } from './_helpers';
```

- [ ] **Step 2: Add field to outputSchema**

Find the outputSchema `fields` array (line 25). After the `recommendation` object (around line 60), add as a sibling (still inside `fields`):

```typescript
        contentWarningField('topic input'),
```

The final structure:
```typescript
    outputSchema: {
      name: 'BC_BRAINSTORM_OUTPUT',
      fields: [
        arrOf('ideas', ...),
        obj('recommendation', ...),
        contentWarningField('topic input'),
      ],
    },
```

- [ ] **Step 3: Add rule to rules.content**

Append to `rules.content` array (after the existing "Never name specific companies" rule at line 75):

```typescript
        'If the topic is unviable (cannot generate viable ideas after reasonable effort), set content_warning with "Topic unviable — ideas array may contain only weak/experimental verdicts" instead of inventing viable-looking fabrications.',
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @brighttale/shared`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/agents/brainstorm.ts
git commit -m "feat(brainstorm): add content_warning field and fallback rule"
```

---

## Task 8: Add content_warning to research.ts

**Files:**
- Modify: `scripts/agents/research.ts:51-107` (outputSchema), `:108-133` (rules)

- [ ] **Step 1: Import helper**

At top of `scripts/agents/research.ts`, add `contentWarningField`:

```typescript
import { str, num, bool, obj, arr, arrOf, STANDARD_JSON_RULES, contentWarningField } from './_helpers';
```

- [ ] **Step 2: Add field to outputSchema**

Find the `outputSchema.fields` array. After the `refined_angle` object (around line 105), add as sibling:

```typescript
        contentWarningField('research material (sources, statistics, or expert quotes)'),
```

- [ ] **Step 3: Add rule to rules.validation**

Append to `rules.validation` array (after the existing "Never fabricate URLs" rule):

```typescript
        'If fewer than depth-implied minimum sources are verifiable (3 for standard, 5 for deep), populate content_warning with "Only N verifiable sources found for <depth> depth — results may be incomplete" instead of padding with weak sources.',
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @brighttale/shared`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/agents/research.ts
git commit -m "feat(research): add content_warning field and fallback rule"
```

---

## Task 9: Add content_warning to content-core.ts

**Files:**
- Modify: `scripts/agents/content-core.ts` (outputSchema — locate the fields array)

- [ ] **Step 1: Import helper**

At top of `scripts/agents/content-core.ts`, add `contentWarningField` to imports.

- [ ] **Step 2: Add field to outputSchema**

Locate the `outputSchema.fields` array. Append as the last field (sibling to whatever final field exists):

```typescript
        contentWarningField('research material for canonical-core generation'),
```

If you can't find the exact structure, run:
```bash
grep -n "outputSchema" scripts/agents/content-core.ts
```
to locate the schema block.

- [ ] **Step 3: Add rule to rules.content**

Append to `rules.content` array:

```typescript
        'If research.sources or research.statistics cannot support the thesis (insufficient evidence), populate content_warning with "Thesis under-supported by research — recommend abandon or deeper research" instead of fabricating evidence.',
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @brighttale/shared`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/agents/content-core.ts
git commit -m "feat(content-core): add content_warning field and fallback rule"
```

---

## Task 10: Brainstorm product_categories regex rule (T3a)

**Files:**
- Modify: `scripts/agents/brainstorm.ts:63-78` (rules.content)

- [ ] **Step 1: Add regex rule to rules.content**

Append to `rules.content` array in `brainstorm.ts`:

```typescript
        'monetization_hypothesis.product_categories[] values MUST match pattern /^[a-z ]+(brands|tools|platforms|services|products|apparel|gear|software|equipment)$/. Never specific company names. Reject: "Nike", "Shopify", "Adobe", "Canva". Accept: "outdoor gear brands", "SaaS productivity tools", "B2B analytics platforms".',
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @brighttale/shared`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/agents/brainstorm.ts
git commit -m "feat(brainstorm): regex rule for product_categories — no brand names"
```

---

## Task 11: Shorts stats fallback rule (T3b)

**Files:**
- Modify: `scripts/agents/shorts.ts` (rules.content — locate by grep)

- [ ] **Step 1: Locate rules.content**

Run:
```bash
grep -n "rules:" scripts/agents/shorts.ts
```

- [ ] **Step 2: Add stats fallback rule**

Append to `rules.content`:

```typescript
        'If input key_stats is empty, every short MUST use qualitative framing derived from thesis. Never paraphrase an invented number as fact. If a short\'s hook requires a stat and none is in input, populate content_warning and use a qualitative hook.',
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @brighttale/shared`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/agents/shorts.ts
git commit -m "feat(shorts): stats fallback rule — no invented numbers"
```

---

## Task 12: Engagement stats tightening (T3c)

**Files:**
- Modify: `scripts/agents/engagement.ts:52-59` (rules.content)

- [ ] **Step 1: Replace thread_outline stat rule**

Find line 56 (the thread_outline rule containing "supported by a stat from `key_stats` where possible"). Replace:

```typescript
        '`thread_outline`: 4-6 tweets expanding the argument. Each tweet = one sharp point, supported by a stat from `key_stats` where possible. Keep each tweet under 280 characters. Last tweet = CTA (subscribe, video link placeholder, or engagement question).',
```

With:

```typescript
        '`thread_outline`: 4-6 tweets expanding the argument. Each tweet = one sharp point. Every quantitative claim MUST cite a figure from input `key_stats[].figure`. Qualitative claims only allowed when no stat fits the point. Never invent percentages, dates, or counts. Keep each tweet under 280 characters. Last tweet = CTA (subscribe, video link placeholder, or engagement question).',
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @brighttale/shared`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/agents/engagement.ts
git commit -m "feat(engagement): tighten stat rule — cite key_stats[].figure"
```

---

## Task 13: Video config metric benchmarks (T3d)

**Files:**
- Modify: `scripts/agents/video.ts` (rules.content — locate by grep)

- [ ] **Step 1: Locate rules.content in video.ts**

Run:
```bash
grep -n "rules:" scripts/agents/video.ts
```

- [ ] **Step 2: Add benchmark rules to rules.content**

Append to `rules.content` array:

```typescript
        'cut_frequency benchmarks: "slow" = 1 cut per 8-10 seconds, "moderate" = 2-3 cuts per 10 seconds, "fast" = 5+ cuts per 10 seconds, "variable" = scene-driven, "action_based" = beat-matched to audio.',
        'text_overlays benchmarks: "heavy" = every stat plus every major claim opening, "moderate" = key claims only, "light" = opener and closer only, "none" = no on-screen text.',
        'b_roll_density benchmarks: "low" = under 20% of screen time uses b-roll, "moderate" = 20-50%, "heavy" = over 50%.',
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @brighttale/shared`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/agents/video.ts
git commit -m "feat(video): add cut_frequency/text_overlays/b_roll_density benchmarks"
```

---

## Task 14: Compress video.ts (T2a)

**Files:**
- Modify: `scripts/agents/video.ts` (customSections block)

**Goal:** Drop "Before Finishing" block (merge items into `rules.validation`). Collapse 8 Field Guidance subsections into 4 inline examples within `rules.content`. Consolidate per-chapter `sound_effects`/`background_music` → top-level `audio_direction`.

Current line count: 305. Target: ~180. Acceptable range: 180-220.

- [ ] **Step 1: Read current customSections**

```bash
cat scripts/agents/video.ts
```
Read lines from ~line 250 through end-of-file (the customSections array).

- [ ] **Step 2: Extract "Before Finishing" checks into rules.validation**

Find the `customSections` entry titled "Before Finishing". Read its numbered checks. For each check, add the programmatic version to `rules.validation`:

```typescript
      validation: [
        // ... existing validation rules,
        'Verify title_options array has exactly 3 items.',
        'Verify teleprompter_script exists and is non-empty.',
        'Verify chapters array has at least 1 chapter.',
        'Verify each chapter has duration_seconds, visual_direction, and narration.',
        'Verify thumbnail object contains concept_description, color_palette, and text_overlay.',
        'Verify audio_direction exists at top level (not per-chapter).',
      ],
```

Delete the "Before Finishing" customSection entry entirely.

- [ ] **Step 3: Consolidate sound_effects + background_music → audio_direction**

Find the chapter schema (per-chapter fields). Remove any `sound_effects` and `background_music` string fields. Add at the top-level outputSchema (sibling to `chapters`):

```typescript
        str('audio_direction', 'Overall mood/genre guidance for audio. Editor selects actual tracks. e.g., "Upbeat electronic for action scenes; ambient pad for reflective moments."'),
```

Update `rules.content` to reference the new field:

```typescript
        'audio_direction is top-level, not per-chapter. Editor selects tracks matching the overall mood.',
```

- [ ] **Step 4: Collapse Field Guidance sections**

Identify the 8 Field Guidance customSections. Keep the most critical 4 (judgment: pick the ones covering teleprompter_script, chapters, thumbnail, and title_options). Merge the other 4 into `rules.content` as prose bullets (one line each). Delete the merged customSections.

For each surviving Field Guidance section, trim to ONE example (not 2-3).

- [ ] **Step 5: Verify line count**

```bash
wc -l scripts/agents/video.ts
```

Expected: 180-220 lines (target 180, acceptable 220).

- [ ] **Step 6: Run seed generation to verify structure**

```bash
npx tsx scripts/generate-seed.ts 2>&1 | tail -10
```

Expected: generation succeeds without errors.

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck --workspace @brighttale/shared
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/agents/video.ts
git commit -m "refactor(video): compress customSections, consolidate audio_direction"
```

---

## Task 15: Compress review.ts (T2b)

**Files:**
- Modify: `scripts/agents/review.ts`

**Goal:** Drop "Before Finishing" (merge into `rules.validation`). Per-content-type review sections (`blog_review`, `video_review`, `shorts_review`, `podcast_review`, `engagement_review`) drop full-example JSON blocks — keep rubric bullets only. Consolidate 7 Field Guidance subsections into 1 "Rubric Application" block.

Current line count: 611. Target: ~260. Acceptable range: 260-350.

- [ ] **Step 1: Read current customSections**

```bash
grep -n "customSections\|title:" scripts/agents/review.ts
```

Identify every customSection entry. You'll find per-content-type examples + "Before Finishing" + Field Guidance.

- [ ] **Step 2: Extract "Before Finishing" → rules.validation**

Find the "Before Finishing" customSection (around line 599). Read its checks. Add programmatic equivalents to `rules.validation`:

```typescript
      validation: [
        // ... existing,
        'Verify overall_verdict is "approved", "revision_required", or "rejected".',
        'Verify each *_review block (blog_review, video_review, shorts_review, podcast_review, engagement_review) has quality_tier and rubric_checks when present.',
        'Verify rubric_checks.critical_issues, minor_issues, strengths are arrays (not omitted).',
        'Verify ready_to_publish is true only when overall_verdict is "approved".',
      ],
```

Delete the "Before Finishing" customSection.

- [ ] **Step 3: Trim per-content-type review examples**

Find each per-content-type customSection (e.g., one titled "Blog Review Example" or similar). Each contains a full JSON example (~40 lines).

For each, replace the full JSON example with a 6-line rubric bullet list:

```typescript
      {
        title: 'Blog Review Rubric',
        content: `- critical_issues: missing required fields, fabricated stats, factual errors, off-topic content
- minor_issues: weak transitions, unclear sentences, redundant phrases, minor inconsistencies
- strengths: strong hook, clear thesis, well-cited evidence, crisp prose
- quality_tier derivation: 0 critical + 0-2 minor = excellent; 0 critical + 3-5 minor = good; 1-2 critical OR 6+ minor = needs_revision; 3+ critical = reject
- Issue severity guide: factual errors = critical; style = minor; missing schema field = critical`,
      },
```

Repeat for video_review, shorts_review, podcast_review, engagement_review.

- [ ] **Step 4: Consolidate Field Guidance into one Rubric Application block**

Find the 7 Field Guidance subsections. Merge their rules into a single customSection titled "Rubric Application":

```typescript
      {
        title: 'Rubric Application',
        content: `When reviewing each content asset, apply the rubric in this order:

1. Check all required schema fields are present. Missing field = critical_issue.
2. Verify every stat/quote in the content traces to input research.sources or research.statistics. Unsourced = critical_issue.
3. Check factual correctness against research.idea_validation. Contradicts research = critical_issue.
4. Evaluate prose quality (clarity, flow, engagement). Weak prose = minor_issue.
5. Aggregate critical + minor counts → derive quality_tier via the deterministic rule.
6. Populate rubric_checks.strengths with 2-4 specific positives.

Reject payload rule: if production.<type> is null/undefined/empty-string, quality_tier = "reject" and critical_issue = "Missing required payload: production.<type>".

Malformed JSON rule: if production field is a malformed JSON string (e.g., truncated), quality_tier = "reject" and critical_issue = "Malformed production payload".

Missing type rule: if content_types_requested contains a type not present in production, critical_issue = "Requested <type> but no <type> payload provided".`,
      },
```

Delete the 7 individual Field Guidance subsections.

- [ ] **Step 5: Verify line count**

```bash
wc -l scripts/agents/review.ts
```

Expected: 260-350 lines.

- [ ] **Step 6: Verify seed generation**

```bash
npx tsx scripts/generate-seed.ts 2>&1 | tail -10
```

Expected: success.

- [ ] **Step 7: Run existing agentContracts test**

```bash
npx vitest run packages/shared/src/mappers/__tests__/agentContracts.test.ts 2>&1 | tail -20
```

Expected: PASS (inputSchema untouched; test asserts input field presence only).

- [ ] **Step 8: Commit**

```bash
git add scripts/agents/review.ts
git commit -m "refactor(review): compress customSections from 611 to ~300 lines"
```

---

## Task 16: Compress content-core.ts (T2c)

**Files:**
- Modify: `scripts/agents/content-core.ts`

**Goal:** Drop "Before Finishing" (merge to `rules.validation`). Reduce 11 customSections to 4.

Current line count: 228. Target: ~120. Acceptable: 120-160.

- [ ] **Step 1: Read current structure**

```bash
grep -n "title:" scripts/agents/content-core.ts
```

- [ ] **Step 2: Extract "Before Finishing" → rules.validation**

Find the "Before Finishing" customSection (around line 221). Merge its checks into `rules.validation` as array entries (one per check). Delete the customSection.

- [ ] **Step 3: Reduce customSections to 4**

Keep only the 4 most critical customSections (judgment — pick ones for: thesis derivation, argument_chain structure, cta_subscribe rule, affiliate_moment handling).

For any subsection being dropped, if it contains a load-bearing rule, merge that rule into `rules.content` as a prose bullet.

- [ ] **Step 4: Verify line count**

```bash
wc -l scripts/agents/content-core.ts
```

Expected: 120-160 lines.

- [ ] **Step 5: Verify seed generation**

```bash
npx tsx scripts/generate-seed.ts 2>&1 | tail -5
```

Expected: success.

- [ ] **Step 6: Commit**

```bash
git add scripts/agents/content-core.ts
git commit -m "refactor(content-core): compress customSections from 228 to ~140 lines"
```

---

## Task 17: Compress podcast.ts (T2d)

**Files:**
- Modify: `scripts/agents/podcast.ts`

**Goal:** "Before Finishing" (line 168) → `rules.validation`. 4 Field Guidance blocks → inline examples in `rules.content`.

Current: 179. Target: ~120. Acceptable: 120-140.

- [ ] **Step 1: Locate customSections**

```bash
grep -n "title:" scripts/agents/podcast.ts
```

- [ ] **Step 2: Extract "Before Finishing" → rules.validation**

Merge checks into `rules.validation`. Delete the customSection.

- [ ] **Step 3: Collapse 4 Field Guidance blocks**

For each Field Guidance block, extract the ONE load-bearing example and inline it into `rules.content` as a prose bullet. Delete the 4 customSections.

- [ ] **Step 4: Verify line count**

```bash
wc -l scripts/agents/podcast.ts
```

Expected: 120-140 lines.

- [ ] **Step 5: Verify seed generation**

```bash
npx tsx scripts/generate-seed.ts 2>&1 | tail -5
```

Expected: success.

- [ ] **Step 6: Commit**

```bash
git add scripts/agents/podcast.ts
git commit -m "refactor(podcast): compress customSections from 179 to ~130 lines"
```

---

## Task 18: Compress engagement.ts (T2e)

**Files:**
- Modify: `scripts/agents/engagement.ts`

**Goal:** "Before Finishing" (line 166) → `rules.validation`. YAML-style Twitter thread example (~30 lines, line 131-164) → 8-line JSON example. Dedupe "No fabricated stats" (appears in both principles and rules.content).

Current: 177. Target: ~90. Acceptable: 90-130.

- [ ] **Step 1: Extract "Before Finishing" → rules.validation**

Find the customSection at line 166. Merge its 7 checks into `rules.validation`. Delete the customSection.

- [ ] **Step 2: Replace YAML-style thread example**

Find the customSection "Field Guidance: Twitter Thread (Outline)" (around line 131). Its content contains a YAML-style example (~30 lines). Replace the YAML block with this 8-line JSON example:

```typescript
      {
        title: 'Field Guidance: Twitter Thread (Outline)',
        content: `thread_outline expands the hook_tweet with 4-6 supporting tweets. Each tweet = one sharp point, under 280 chars, cites a stat from key_stats[] when making quantitative claims. Last tweet = CTA.

Example (JSON — inline \\n for line breaks):
{
  "hook_tweet": "You don't need more sleep — you need the RIGHT sleep timing. Here's the science.",
  "thread_outline": [
    "2/ Your body has a peak sleep window (2-4 hours in your cycle). Outside it, sleep quality tanks even at 8 hours.",
    "3/ Track energy at different sleep times for 5 days. You'll find your peak window — often NOT your current schedule.",
    "4/ key_stats[0].figure: shifting sleep to peak window improves recovery by X%. Not 40% more sleep — 40% better.",
    "5/ Try shifting your schedule 1.5 hours for one week. Track energy, mood, focus. Compare to baseline.",
    "6/ Subscribe for more research-backed productivity insights. Sleep timing is one lever — we cover the others."
  ]
}`,
      },
```

- [ ] **Step 3: Dedupe "No fabricated stats"**

If `header.principles` contains "No fabricated stats" AND `rules.content` contains the same rule, keep only the `rules.content` version (rules are enforced; principles are aspirational prose).

- [ ] **Step 4: Verify line count**

```bash
wc -l scripts/agents/engagement.ts
```

Expected: 90-130 lines.

- [ ] **Step 5: Verify seed generation**

```bash
npx tsx scripts/generate-seed.ts 2>&1 | tail -5
```

Expected: success.

- [ ] **Step 6: Commit**

```bash
git add scripts/agents/engagement.ts
git commit -m "refactor(engagement): compress customSections, JSON thread example"
```

---

## Task 19: Research echo input constraints (T4a)

**Files:**
- Modify: `scripts/agents/research.ts:51-107` (outputSchema), `:108-133` (rules.validation)

- [ ] **Step 1: Add echo fields to outputSchema**

In `scripts/agents/research.ts`, find the `outputSchema.fields` array. After the `str('idea_id', ...)` entry (line 54), add:

```typescript
        str('research_focus_applied', 'Echo of input research_focus array, joined by "; " if multiple. Must reflect exactly what was researched.'),
        str('depth_applied', 'Echo of input depth: quick, standard, or deep. Must match input.'),
```

- [ ] **Step 2: Add validation rules**

In `rules.validation`, append:

```typescript
        'research_focus_applied MUST reflect input research_focus exactly. If input research_focus is omitted, set to "general topic exploration".',
        'depth_applied MUST equal input depth. If input depth is omitted, set to "standard".',
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @brighttale/shared`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/agents/research.ts
git commit -m "feat(research): echo research_focus and depth in output"
```

---

## Task 20: Research secondary_keywords source attribution (T4b)

**Files:**
- Modify: `scripts/agents/research.ts:92-96` (seo block)
- Modify: `packages/shared/src/mappers/pipeline.ts`
- Modify: `packages/shared/src/mappers/__tests__/pipeline.test.ts`

- [ ] **Step 1: Change secondary_keywords schema shape**

In `research.ts`, find the `seo` object (line 92). Replace the `secondary_keywords` field:

```typescript
          arr('secondary_keywords', 'Related keywords found during research (3-5)', 'string', false),
```

With:

```typescript
          arrOf('secondary_keywords', 'Related keywords with source attribution (3-5)', [
            str('keyword', 'The keyword phrase'),
            str('source_id', 'Must match an entry in sources[]'),
          ], false),
```

- [ ] **Step 2: Add legacyKeywordFallback to pipeline.ts**

Open `packages/shared/src/mappers/pipeline.ts`. Find the mappers relating to research output (search for `secondary_keywords`). Add this helper near the top:

```typescript
export function legacyKeywordFallback(
  keywords: unknown,
): string[] {
  if (!Array.isArray(keywords)) return [];
  return keywords
    .map((k) => {
      if (typeof k === 'string') return k;
      if (k && typeof k === 'object' && 'keyword' in k && typeof (k as { keyword: unknown }).keyword === 'string') {
        return (k as { keyword: string }).keyword;
      }
      return null;
    })
    .filter((k): k is string => k !== null);
}
```

- [ ] **Step 3: Use helper in downstream mappers**

Find any mapper that reads `research.seo.secondary_keywords` and feeds it downstream (e.g., `mapResearchToContentInput` or `mapBrainstormToResearchInput` — grep for it).

Wrap the read with the helper:

```typescript
const secondary = legacyKeywordFallback(research.seo?.secondary_keywords);
```

- [ ] **Step 4: Write round-trip test**

Open `packages/shared/src/mappers/__tests__/pipeline.test.ts`. Add at the end:

```typescript
import { legacyKeywordFallback } from '../pipeline';

describe('legacyKeywordFallback', () => {
  it('returns string array from legacy string[] shape', () => {
    expect(legacyKeywordFallback(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('returns keyword field from new shape', () => {
    expect(
      legacyKeywordFallback([
        { keyword: 'a', source_id: 'SRC-001' },
        { keyword: 'b', source_id: 'SRC-002' },
      ]),
    ).toEqual(['a', 'b']);
  });

  it('handles mixed shapes', () => {
    expect(
      legacyKeywordFallback([
        'legacy',
        { keyword: 'new', source_id: 'SRC-001' },
      ]),
    ).toEqual(['legacy', 'new']);
  });

  it('returns empty array for non-array input', () => {
    expect(legacyKeywordFallback(null)).toEqual([]);
    expect(legacyKeywordFallback(undefined)).toEqual([]);
    expect(legacyKeywordFallback('not-an-array')).toEqual([]);
  });

  it('filters out malformed entries', () => {
    expect(
      legacyKeywordFallback([
        'ok',
        { wrong: 'shape' },
        null,
        { keyword: 'good', source_id: 'SRC-001' },
      ]),
    ).toEqual(['ok', 'good']);
  });
});
```

- [ ] **Step 5: Run the test**

```bash
npx vitest run packages/shared/src/mappers/__tests__/pipeline.test.ts 2>&1 | tail -20
```

Expected: 5/5 new tests PASS.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck --workspace @brighttale/shared
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/agents/research.ts packages/shared/src/mappers/pipeline.ts packages/shared/src/mappers/__tests__/pipeline.test.ts
git commit -m "feat(research): secondary_keywords with source_id + legacyKeywordFallback"
```

---

## Task 21: Research domain preference and statistics rule (T4c)

**Files:**
- Modify: `scripts/agents/research.ts:115-132` (rules)

- [ ] **Step 1: Add domain preference rule to rules.content**

Append to `rules.content`:

```typescript
        'Prefer well-known domains (.edu, .gov, major publications, Wikipedia) when choosing sources. Flag obscure domains in validation_notes.',
```

- [ ] **Step 2: Tighten statistics rule in rules.validation**

Append to `rules.validation`:

```typescript
        'Every entry in statistics[] MUST have source_id matching an entry in sources[]. No standalone figures.',
        'Every entry in expert_quotes[] MUST have source_id matching sources[]. Never fabricate attributed quotes — if no verified quote, leave expert_quotes empty and note in content_warning.',
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck --workspace @brighttale/shared
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/agents/research.ts
git commit -m "feat(research): domain preference + strict source_id rules"
```

---

## Task 22: Grep invariant verification script

**Files:**
- Create: `scripts/verify-prompts.sh`

- [ ] **Step 1: Create the script**

Write to `scripts/verify-prompts.sh`:

```bash
#!/usr/bin/env bash
set -e

AGENT_DIR="scripts/agents"
FAIL=0

# Invariant 1: No "Before Finishing" customSection anywhere (merged into rules.validation)
if grep -rn "'Before Finishing'\|\"Before Finishing\"" "$AGENT_DIR" --include='*.ts' | grep -v "_helpers.ts"; then
  echo "FAIL: 'Before Finishing' still present — merge into rules.validation"
  FAIL=1
fi

# Invariant 2: STANDARD_JSON_RULES contents not duplicated outside _helpers.ts
for phrase in "No em-dashes" "No curly quotes" "JSON parseable" "parseable by JSON.parse"; do
  if grep -rn "$phrase" "$AGENT_DIR" --include='*.ts' | grep -v "_helpers.ts"; then
    echo "FAIL: '$phrase' appears outside _helpers.ts — should live only in STANDARD_JSON_RULES"
    FAIL=1
  fi
done

# Invariant 3: Every agent with content_warning uses the helper (no inline str() declaration)
INLINE=$(grep -rn "str('content_warning'" "$AGENT_DIR" --include='*.ts' || true)
if [ -n "$INLINE" ]; then
  echo "FAIL: inline content_warning declarations found — use contentWarningField() helper:"
  echo "$INLINE"
  FAIL=1
fi

if [ $FAIL -eq 0 ]; then
  echo "All prompt invariants PASS"
fi

exit $FAIL
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/verify-prompts.sh
```

- [ ] **Step 3: Run**

```bash
./scripts/verify-prompts.sh
```

Expected: "All prompt invariants PASS". If any fail, go back to the relevant task and fix.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-prompts.sh
git commit -m "feat(scripts): verify-prompts.sh — enforce invariants"
```

---

## Task 23: Extend agentContracts test for content_warning

**Files:**
- Modify: `packages/shared/src/mappers/__tests__/agentContracts.test.ts`

- [ ] **Step 1: Read current test structure**

```bash
cat packages/shared/src/mappers/__tests__/agentContracts.test.ts
```

Find or create a test suite that imports agent definitions.

- [ ] **Step 2: Add content_warning field presence tests**

Append (adjust imports to existing structure):

```typescript
import { brainstorm } from '../../../../../scripts/agents/brainstorm';
import { research } from '../../../../../scripts/agents/research';
import { blog } from '../../../../../scripts/agents/blog';
import { video } from '../../../../../scripts/agents/video';
import { shorts } from '../../../../../scripts/agents/shorts';
import { podcast } from '../../../../../scripts/agents/podcast';
import { engagement } from '../../../../../scripts/agents/engagement';
import { contentCore } from '../../../../../scripts/agents/content-core';

describe('content_warning field presence', () => {
  const agentsToCheck = [
    { name: 'brainstorm', agent: brainstorm },
    { name: 'research', agent: research },
    { name: 'blog', agent: blog },
    { name: 'video', agent: video },
    { name: 'shorts', agent: shorts },
    { name: 'podcast', agent: podcast },
    { name: 'engagement', agent: engagement },
    { name: 'content-core', agent: contentCore },
  ];

  for (const { name, agent } of agentsToCheck) {
    it(`${name}.outputSchema declares content_warning`, () => {
      const findField = (fields: unknown[]): boolean =>
        fields.some((f) => {
          if (!f || typeof f !== 'object') return false;
          const field = f as { name?: string; fields?: unknown[] };
          if (field.name === 'content_warning') return true;
          if (Array.isArray(field.fields)) return findField(field.fields);
          return false;
        });
      expect(findField(agent.sections.outputSchema.fields)).toBe(true);
    });
  }
});
```

Adjust the relative import path (`../../../../../scripts/agents/`) if the test file depth is different.

- [ ] **Step 3: Run the test**

```bash
npx vitest run packages/shared/src/mappers/__tests__/agentContracts.test.ts 2>&1 | tail -25
```

Expected: all new content_warning assertions PASS.

If any FAIL: the agent doesn't have content_warning in its outputSchema. Go back to Tasks 2-9 and verify the field is actually declared.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/mappers/__tests__/agentContracts.test.ts
git commit -m "test(agents): assert content_warning in 8 agent outputSchemas"
```

---

## Task 24: ReviewEngine tier badge UI (T5a)

**Files:**
- Modify: `apps/app/src/components/engines/ReviewEngine.tsx:230-295`

- [ ] **Step 1: Add tier badge component inline**

Locate the import block at the top of `ReviewEngine.tsx`. Verify `deriveTier, isApprovedTier` are already imported from `@brighttale/shared` (they should be from Plan A).

Find the rendering section where "Score: X/100" appears (search for `Score:` or `toast.success.*Score`).

Before the render, compute the tier display:

```typescript
const tier = deriveTier(formatReview ?? feedbackJson);
const tierLabel: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  needs_revision: 'Needs Revision',
  reject: 'Rejected',
  not_requested: 'Not Reviewed',
};
const tierColor: Record<string, string> = {
  excellent: 'bg-green-500/20 text-green-700 border-green-500/50',
  good: 'bg-blue-500/20 text-blue-700 border-blue-500/50',
  needs_revision: 'bg-amber-500/20 text-amber-700 border-amber-500/50',
  reject: 'bg-red-500/20 text-red-700 border-red-500/50',
  not_requested: 'bg-gray-500/20 text-gray-700 border-gray-500/50',
};
```

- [ ] **Step 2: Replace Score toast with tier-aware toast**

Find lines ~289-294:

```typescript
        if (verdict === 'approved') {
          toast.success(`Review imported — Score: ${score}/100 — Approved!`);
        } else if (verdict === 'rejected') {
          toast.error(`Review imported — Score: ${score}/100 — Rejected`);
        } else {
          toast.warning(`Review imported — Score: ${score}/100 — Revision required`);
        }
```

Replace with:

```typescript
        const tierText = tierLabel[tier] ?? 'Unknown';
        if (verdict === 'approved') {
          toast.success(`Review imported — ${tierText} — Approved!`);
        } else if (verdict === 'rejected') {
          toast.error(`Review imported — ${tierText} — Rejected`);
        } else {
          toast.warning(`Review imported — ${tierText} — Revision required`);
        }
```

- [ ] **Step 3: Find any inline `Score: X/100` JSX rendering**

```bash
grep -n "Score:" apps/app/src/components/engines/ReviewEngine.tsx
```

For each occurrence in JSX (not strings in toasts), add a tier badge alongside:

```tsx
<span className={`px-2 py-0.5 text-xs rounded border ${tierColor[tier]}`}>
  {tierLabel[tier]}
</span>
```

If the component renders `rubric_checks`, find the block (search for `rubric_checks` in the file). If not present, add a collapsible section:

```tsx
{formatReview?.rubric_checks && (
  <details className="mt-2">
    <summary className="cursor-pointer text-sm">Rubric Details</summary>
    <div className="mt-2 space-y-1 text-sm">
      {(formatReview.rubric_checks as { critical_issues?: string[] }).critical_issues?.map((issue, i) => (
        <div key={`crit-${i}`} className="text-red-600">• {issue}</div>
      ))}
      {(formatReview.rubric_checks as { minor_issues?: string[] }).minor_issues?.map((issue, i) => (
        <div key={`minor-${i}`} className="text-amber-600">• {issue}</div>
      ))}
      {(formatReview.rubric_checks as { strengths?: string[] }).strengths?.map((s, i) => (
        <div key={`str-${i}`} className="text-green-600">✓ {s}</div>
      ))}
    </div>
  </details>
)}
```

- [ ] **Step 4: Keep legacyScoreFromTier map for orchestrator gate**

Do NOT remove the existing `legacyScoreFromTier` map (lines 264-267). The orchestrator still reads numeric score for its `< 40` pause gate.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck --workspace @brighttale/app
```

Expected: PASS.

- [ ] **Step 6: Build to check for runtime errors**

```bash
npm run build --workspace @brighttale/app 2>&1 | tail -20
```

Expected: build succeeds (no SSR errors on new JSX).

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/components/engines/ReviewEngine.tsx
git commit -m "feat(review-engine): render quality_tier badge + rubric_checks"
```

---

## Task 25: CompletedStageSummary tier badge (T5b)

**Files:**
- Modify: `apps/app/src/components/pipeline/CompletedStageSummary.tsx:53-56`

- [ ] **Step 1: Import deriveTier**

At the top of `CompletedStageSummary.tsx`, add (or extend existing `@brighttale/shared` import):

```typescript
import { deriveTier } from '@brighttale/shared';
```

- [ ] **Step 2: Replace review stage summary**

Find lines 53-56:

```typescript
      case 'review': {
        const r = stageResults.review;
        return r ? `Score: ${r.score}/100 · ${r.verdict} · ${r.iterationCount} iteration(s)` : '';
      }
```

Replace with:

```typescript
      case 'review': {
        const r = stageResults.review;
        if (!r) return '';
        const tier = deriveTier({ quality_tier: (r as { qualityTier?: string }).qualityTier, score: r.score });
        const tierLabel: Record<string, string> = {
          excellent: 'Excellent',
          good: 'Good',
          needs_revision: 'Needs Revision',
          reject: 'Rejected',
          not_requested: 'Not Reviewed',
        };
        const display = tier === 'not_requested' && typeof r.score === 'number'
          ? `${r.score}/100`
          : tierLabel[tier] ?? 'Unknown';
        return `${display} · ${r.verdict} · ${r.iterationCount} iteration(s)`;
      }
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck --workspace @brighttale/app
```

Expected: PASS. If `stageResults.review` type doesn't include `qualityTier`, that's fine — the cast handles it; legacy reviews without qualityTier fall through to score display.

- [ ] **Step 4: Build**

```bash
npm run build --workspace @brighttale/app 2>&1 | tail -10
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/pipeline/CompletedStageSummary.tsx
git commit -m "feat(pipeline): tier badge in stage summary with legacy score fallback"
```

---

## Task 26: Regenerate seed.sql and migration

**Files:**
- Modify: `supabase/seed.sql`
- Create: `supabase/migrations/<timestamp>_refresh_agent_prompts_plan_b.sql`

- [ ] **Step 1: Regenerate seed**

```bash
npm run db:seed:agents 2>&1 | tail -5
```

If that script doesn't exist, run directly:

```bash
npx tsx scripts/generate-seed.ts 2>&1 | tail -5
```

Expected: `supabase/seed.sql` updated.

- [ ] **Step 2: Create timestamped migration**

Get current timestamp:

```bash
date -u +%Y%m%d%H%M%S
```

Copy the seed SQL into a migration (the migration is the same SQL — Supabase won't re-run migrations by hash, so a new timestamp forces re-application):

```bash
TS=$(date -u +%Y%m%d%H%M%S)
cp supabase/seed.sql "supabase/migrations/${TS}_refresh_agent_prompts_plan_b.sql"
```

- [ ] **Step 3: Verify migration file created**

```bash
ls -la supabase/migrations/*plan_b*.sql
```

Expected: one new file with today's timestamp.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql supabase/migrations/*plan_b*.sql
git commit -m "chore(db): regenerate agent prompt seed + Plan B migration"
```

---

## Task 27: Run full test suite

**Files:** (no changes)

- [ ] **Step 1: Run shared tests**

```bash
npm run test --workspace @brighttale/shared 2>&1 | tail -15
```

Expected: all tests PASS (includes new `legacyKeywordFallback` tests and `content_warning` contract assertions).

- [ ] **Step 2: Run app tests**

```bash
npm run test --workspace @brighttale/app 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 3: Run api tests**

```bash
npm run test --workspace @brighttale/api 2>&1 | tail -15
```

Expected: PASS except for 7 pre-existing failures in content-drafts and wordpress routes (unrelated to Plan B).

- [ ] **Step 4: Run grep invariants**

```bash
./scripts/verify-prompts.sh
```

Expected: "All prompt invariants PASS".

- [ ] **Step 5: Check line counts**

```bash
wc -l scripts/agents/*.ts
```

Expected (approximate, bands):
- video.ts: 180-220
- review.ts: 260-350
- content-core.ts: 120-160
- podcast.ts: 120-140
- engagement.ts: 90-130

If any exceed the upper band, revisit the relevant compression task and trim further.

- [ ] **Step 6: (No commit — verification only.)**

---

## Task 28: Re-audit

**Files:** (no changes — audit subagent dispatched via Claude Code)

- [ ] **Step 1: Run the 13-criterion re-audit**

Use the Agent tool to dispatch a general-purpose subagent with the exact same prompt structure used in the Plan B design phase. Ask for:
- Score matrix (9 agents × 13 criteria).
- Per-agent evidence for any score < 8.5.
- Comparison table: projected (from spec) vs actual.

- [ ] **Step 2: Compare to targets**

Expected (per spec):
- Research ≥ 8.5
- Content-Core ≥ 8.5
- Blog ≥ 8.5
- Video ≥ 8.5
- Shorts ≥ 8.5
- Podcast ≥ 8.5
- Engagement ≥ 8.5
- Review ≥ 8.5
- Brainstorm ~8.3 (accepted with iteration note)

- [ ] **Step 3: Write handoff doc**

If re-audit confirms targets: create `docs/agent-prompt-audit-post-plan-b.md` documenting final scores. Model after `docs/agent-prompt-audit-post-plan-a.md`.

If re-audit shows any agent below target (other than Brainstorm): note the specific criterion and gap. That becomes the scope for a follow-up single-agent iteration (not part of Plan B).

- [ ] **Step 4: Commit handoff doc**

```bash
git add docs/agent-prompt-audit-post-plan-b.md
git commit -m "docs(agents): Plan B handoff audit + final scores"
```

---

## Self-Review Summary

**Spec coverage check:**
- T1 (content_warning fleet-wide) → Tasks 1-9 (helper + 4 migrations + 4 additions).
- T2 (compression) → Tasks 14-18 (5 agents).
- T3 (hallucination guards) → Tasks 10-13 (brainstorm regex, shorts fallback, engagement tightening, video metrics).
- T4 (Research echo + keyword shape) → Tasks 19-21 (echo fields, secondary_keywords shape, domain rule).
- T5 (UX polish) → Tasks 24-25 (ReviewEngine, CompletedStageSummary).
- Verification → Tasks 22-23 (grep script, contract test), Task 27 (full suite).
- Seed + migration → Task 26.
- Re-audit → Task 28.

All spec sections have matching tasks. No gaps.

**Type consistency:** `contentWarningField()` returns `SchemaField` (same as `str()`); signature accepts optional string purpose. Used identically in 8 agents. `legacyKeywordFallback(keywords: unknown): string[]` consistent across mapper + test.

**Note on spec correction:** Spec said "Brainstorm and Research already declare content_warning inline — migrate to helper." Reality: neither has it. Plan correctly adds it fresh via Tasks 7-8 (not a migration). Functionally the spec goal is met.
