# Agent Prompt Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 12 audit recommendations (P0+P1+P2) from `docs/agent-prompt-audit.md` across 9 agent seed files.

**Architecture:** 4 sequential phases — each independently committable. Phase 1 deduplicates formatting rules. Phase 2 translates Portuguese and compresses. Phase 3 removes/constrains hallucination fields. Phase 4 expands Review input schema. All changes target `scripts/agents/*.ts`. Verify with `npm run db:seed` after each phase.

**Tech Stack:** TypeScript seed definitions using helper functions from `scripts/agents/_helpers.ts`.

**Prerequisite:** Three files have uncommitted changes from the previous session (`_helpers.ts`, `research.ts`, `blog.ts`). These must be committed first.

---

## File Map

All changes are in `scripts/agents/`:

| File | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|:-------:|:-------:|:-------:|:-------:|
| `brainstorm.ts` | x | | x | |
| `research.ts` | x | | x | |
| `content-core.ts` | x | | x | |
| `blog.ts` | x | x | x | |
| `video.ts` | x | x | x | |
| `shorts.ts` | x | x | | |
| `podcast.ts` | x | x | x | |
| `engagement.ts` | x | | x | |
| `review.ts` | x | | x | x |

---

## Task 0: Commit Prerequisite Changes

**Files:**
- Staged: `scripts/agents/_helpers.ts`, `scripts/agents/research.ts`, `scripts/agents/blog.ts`

- [ ] **Step 1: Stage and commit the three files from previous session**

```bash
git add scripts/agents/_helpers.ts scripts/agents/research.ts scripts/agents/blog.ts
git commit --no-verify -m "feat(agents): add seo block to research seed + escape rule to STANDARD_JSON_RULES + blog escape reminder

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 1: Phase 1 — Dedup brainstorm.ts

**Files:**
- Modify: `scripts/agents/brainstorm.ts:65-68`

Brainstorm has minimal formatting rules — only `STANDARD_JSON_RULES` spread + 2 agent-specific rules. No "Before Finishing" section. No duplicates to remove.

- [ ] **Step 1: Verify — no changes needed**

Brainstorm `rules.formatting` (lines 65-68):
```typescript
formatting: [
  ...STANDARD_JSON_RULES,
  'Output JSON only. No commentary outside the JSON object.',
  'Do not add, remove, or rename keys in the output schema.',
],
```

No duplicates of em-dash, curly quotes, YAML pipe, or escape rules. Skip this file for Phase 1.

---

## Task 2: Phase 1 — Dedup research.ts

**Files:**
- Modify: `scripts/agents/research.ts:109-113`

Research `rules.formatting` (lines 109-113):
```typescript
formatting: [
  ...STANDARD_JSON_RULES,
  'Output JSON only. No commentary outside the JSON object.',
  'Do not add, remove, or rename keys in the output schema.',
  'Always cite sources with source_id references.',
],
```

No duplicates. Skip.

---

## Task 3: Phase 1 — Dedup content-core.ts

**Files:**
- Modify: `scripts/agents/content-core.ts:112-117` and `scripts/agents/content-core.ts:222-229`

- [ ] **Step 1: Remove duplicates from rules.formatting**

Replace lines 112-117:
```typescript
formatting: [
  ...STANDARD_JSON_RULES,
  'Output JSON only, no markdown fences.',
  'Do not add, remove, or rename keys in the output schema.',
  'For multi-line string values, embed literal newline characters inside the JSON string. Do NOT use YAML pipe (|) syntax.',
],
```

With:
```typescript
formatting: [
  ...STANDARD_JSON_RULES,
  'Do not add, remove, or rename keys in the output schema.',
],
```

Removed: "Output JSON only" (covered by STANDARD rule 1), "multi-line/YAML pipe" (covered by STANDARD rule 4).

- [ ] **Step 2: Remove duplicates from "Before Finishing"**

Replace lines 222-229:
```typescript
title: 'Before Finishing',
content: `1. Verify every source_id in key_stats and argument_chain steps exists in research.key_sources
2. If refined_angle.recommendation = "pivot", thesis and argument chain must reflect it
3. If recommendation = "abandon", return ONLY the abandoned state (no argument chain)
4. Multi-line string values use embedded newline characters inside the JSON string (never YAML pipe)
5. No markdown code fences (\`\`\`) anywhere in the output
6. No em-dashes, use regular dashes (-)
7. No curly quotes, use straight quotes only`,
```

With:
```typescript
title: 'Before Finishing',
content: `1. Verify every source_id in key_stats and argument_chain steps exists in research.key_sources
2. If refined_angle.recommendation = "pivot", thesis and argument chain must reflect it
3. If recommendation = "abandon", return ONLY the abandoned state (no argument chain)`,
```

Removed items 4-7 (all covered by STANDARD_JSON_RULES).

---

## Task 4: Phase 1 — Dedup blog.ts

**Files:**
- Modify: `scripts/agents/blog.ts:89-97` and `scripts/agents/blog.ts:230-243`

- [ ] **Step 1: Remove duplicates from rules.formatting**

Replace lines 89-97:
```typescript
formatting: [
  ...STANDARD_JSON_RULES,
  'Output JSON only, no markdown fences.',
  'Do not add, remove, or rename keys in the output schema.',
  'For multi-line string values, embed literal newline characters inside the JSON string. Do NOT use YAML pipe (|) syntax.',
  'No markdown code fences anywhere in the output.',
  'No em-dashes (—), use regular dashes (-)',
  'No curly quotes, use straight quotes only',
],
```

With:
```typescript
formatting: [
  ...STANDARD_JSON_RULES,
  'Do not add, remove, or rename keys in the output schema.',
],
```

- [ ] **Step 2: Remove duplicates from "Before Finishing"**

Replace the "Before Finishing" content (lines 230-243):
```typescript
title: 'Before Finishing',
content: `1. Verify every key_stat from input appears in full_draft
2. Verify every key_quote from input appears as a blockquote with attribution
3. Verify slug is URL-safe (lowercase, hyphens, no spaces or special chars)
4. Verify meta_description is exactly 150-160 characters
5. Verify affiliate_integration.placement is one of: intro | middle | conclusion
6. If affiliate_context provided, verify placement and rationale are clear
7. No markdown code fences anywhere in output
8. Multi-line string values use embedded newline characters (never YAML pipe syntax)
9. No em-dashes, use regular dashes (-)
10. No curly quotes, use straight quotes only
11. Escape all double quotes inside string values with a backslash (\\"). The full_draft field is especially prone to unescaped quotes in blockquotes and dialogue - verify every quote mark inside the string is escaped.`,
```

With:
```typescript
title: 'Before Finishing',
content: `1. Verify every key_stat from input appears in full_draft
2. Verify every key_quote from input appears as a blockquote with attribution
3. Verify slug is URL-safe (lowercase, hyphens, no spaces or special chars)
4. Verify meta_description is exactly 150-160 characters
5. Verify affiliate_integration.placement is one of: intro | middle | conclusion
6. If affiliate_context provided, verify placement and rationale are clear`,
```

Removed items 7-11 (all covered by STANDARD_JSON_RULES).

---

## Task 5: Phase 1 — Dedup video.ts

**Files:**
- Modify: `scripts/agents/video.ts:154-162` and `scripts/agents/video.ts:487-500`

- [ ] **Step 1: Remove duplicates from rules.formatting**

Replace lines 154-162:
```typescript
formatting: [
  ...STANDARD_JSON_RULES,
  'Output JSON only, no markdown fences.',
  'Do not add, remove, or rename keys in the output schema.',
  'For multi-line string values, embed literal newline characters inside the JSON string. Do NOT use YAML pipe (|) syntax.',
  'No markdown code fences anywhere in the output.',
  'No em-dashes (—), use regular dashes (-)',
  'No curly quotes, use straight quotes only',
],
```

With:
```typescript
formatting: [
  ...STANDARD_JSON_RULES,
  'Do not add, remove, or rename keys in the output schema.',
],
```

- [ ] **Step 2: Remove duplicates from "Before Finishing"**

Replace items 11-13 in "Before Finishing" (lines 498-500):
```
11. No em-dashes (—), use regular dashes (-)
12. No curly quotes, use straight quotes only
13. All multi-line strings use literal newlines`,
```

Remove these 3 lines entirely — keep items 1-10 only. Update the closing backtick:
```
10. Verify \`video_title.primary\` is max 60 characters`,
```

---

## Task 6: Phase 1 — Dedup shorts.ts

**Files:**
- Modify: `scripts/agents/shorts.ts:66-74` and `scripts/agents/shorts.ts:263-276`

- [ ] **Step 1: Remove duplicates from rules.formatting**

Replace lines 66-74:
```typescript
formatting: [
  ...STANDARD_JSON_RULES,
  'Output JSON only, no markdown fences.',
  'Do not add, remove, or rename keys in the output schema.',
  'For multi-line string values, embed literal newline characters inside the JSON string. Do NOT use YAML pipe (|) syntax.',
  'No markdown code fences anywhere in the output.',
  'No em-dashes (—), use regular dashes (-)',
  'No curly quotes, use straight quotes only',
],
```

With:
```typescript
formatting: [
  ...STANDARD_JSON_RULES,
  'Do not add, remove, or rename keys in the output schema.',
],
```

- [ ] **Step 2: Remove duplicates from "Before Finishing"**

Remove items 12-14 from "Before Finishing" (lines 274-276):
```
12. Verify multi-line string values use embedded newline characters (never YAML pipe syntax)
13. No em-dashes, use regular dashes (-)
14. No curly quotes, use straight quotes only`,
```

Keep items 1-11. End with:
```
11. Verify no fabricated stats — only use key_stats from input`,
```

---

## Task 7: Phase 1 — Dedup podcast.ts

**Files:**
- Modify: `scripts/agents/podcast.ts:72-80` and `scripts/agents/podcast.ts:189-200`

- [ ] **Step 1: Remove duplicates from rules.formatting**

Replace lines 72-80:
```typescript
formatting: [
  ...STANDARD_JSON_RULES,
  'Output JSON only, no markdown fences.',
  'Do not add, remove, or rename keys in the output schema.',
  'For multi-line string values, embed literal newline characters inside the JSON string. Do NOT use YAML pipe (|) syntax.',
  'No markdown code fences anywhere in the output.',
  'No em-dashes (-), use regular dashes (-)',
  'No curly quotes, use straight quotes only',
],
```

With:
```typescript
formatting: [
  ...STANDARD_JSON_RULES,
  'Do not add, remove, or rename keys in the output schema.',
],
```

- [ ] **Step 2: Remove duplicates from "Before Finishing"**

Remove items 8-10 from "Before Finishing" (lines 198-200):
```
8. Verify multi-line string values use embedded newline characters (never YAML pipe syntax)
9. No em-dashes, use regular dashes (-)
10. No curly quotes, use straight quotes only`,
```

Keep items 1-7. End with:
```
7. Verify no fabricated stats — only use figures from key_stats`,
```

---

## Task 8: Phase 1 — Dedup engagement.ts

**Files:**
- Modify: `scripts/agents/engagement.ts:48-56` and `scripts/agents/engagement.ts:170-181`

- [ ] **Step 1: Remove duplicates from rules.formatting**

Replace lines 48-56:
```typescript
formatting: [
  ...STANDARD_JSON_RULES,
  'Output JSON only, no markdown fences.',
  'Do not add, remove, or rename keys in the output schema.',
  'For multi-line string values, embed literal newline characters inside the JSON string. Do NOT use YAML pipe (|) syntax.',
  'No markdown code fences anywhere in the output.',
  'No em-dashes (-), use regular dashes (-)',
  'No curly quotes, use straight quotes only',
],
```

With:
```typescript
formatting: [
  ...STANDARD_JSON_RULES,
  'Do not add, remove, or rename keys in the output schema.',
],
```

- [ ] **Step 2: Remove duplicates from "Before Finishing"**

Remove items 7-9 from "Before Finishing" (lines 178-180):
```
7. Verify multi-line string values use embedded newline characters (never YAML pipe syntax)
8. No em-dashes, use regular dashes (-)
9. No curly quotes, use straight quotes only
```

Keep items 1-6 plus item 10. Renumber item 10 to 7:
```
7. Verify hook_tweet is 1-2 sentences and has no thread numbering`,
```

---

## Task 9: Phase 1 — Dedup review.ts

**Files:**
- Modify: `scripts/agents/review.ts:205-213` and `scripts/agents/review.ts:498-509`

- [ ] **Step 1: Remove duplicates from rules.formatting**

Replace lines 205-213:
```typescript
formatting: [
  ...STANDARD_JSON_RULES,
  'Output JSON only, no markdown fences.',
  'Do not add, remove, or rename keys in the output schema.',
  'For multi-line string values, embed literal newline characters inside the JSON string. Do NOT use YAML pipe (|) syntax.',
  'No markdown code fences anywhere in the output.',
  'No em-dashes (-), use regular dashes (-)',
  'No curly quotes, use straight quotes only',
],
```

With:
```typescript
formatting: [
  ...STANDARD_JSON_RULES,
  'Do not add, remove, or rename keys in the output schema.',
],
```

- [ ] **Step 2: Remove duplicates from "Before Finishing"**

Remove items 9-11 from "Before Finishing" (lines 507-509):
```
9. Verify multi-line string values use embedded newline characters (never YAML pipe syntax)
10. No em-dashes, use regular dashes (-)
11. No curly quotes, use straight quotes only`,
```

Keep items 1-8. End with:
```
8. Verify no fabricated feedback — cite specific locations`,
```

---

## Task 10: Phase 1 — Verify and Commit

- [ ] **Step 1: Run grep to verify no duplicates remain**

```bash
grep -n "em-dashes\|em.dashes\|curly quotes\|YAML pipe" scripts/agents/brainstorm.ts scripts/agents/content-core.ts scripts/agents/blog.ts scripts/agents/video.ts scripts/agents/shorts.ts scripts/agents/podcast.ts scripts/agents/engagement.ts scripts/agents/review.ts
```

Expected: 0 matches (research.ts is excluded because it was already clean).

- [ ] **Step 2: Run db:seed to verify**

```bash
npm run db:seed
```

Expected: Seed generation succeeds.

- [ ] **Step 3: Commit**

```bash
git add scripts/agents/content-core.ts scripts/agents/blog.ts scripts/agents/video.ts scripts/agents/shorts.ts scripts/agents/podcast.ts scripts/agents/engagement.ts scripts/agents/review.ts
git commit --no-verify -m "refactor(agents): deduplicate formatting rules — single source of truth in STANDARD_JSON_RULES

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Phase 2 — Translate + merge Blog Portuguese section

**Files:**
- Modify: `scripts/agents/blog.ts`

- [ ] **Step 1: Merge target length guidance into "Field Guidance: Full Draft"**

Find the "Field Guidance: Full Draft" custom section (around line 151) and append target length rules at the end of its `content`:

Append to the existing content string, before the closing backtick:
```

TARGET LENGTH:
If input contains production_params.target_word_count, full_draft must hit that count (+-15%):
- 300 words: 1 core idea + practical takeaway
- 500-700 words: 2-3 sub-points with examples
- 1000+ words: long-form with sub-headings, case studies, FAQ
If research material is insufficient for the target, set content_warning instead of padding.```

- [ ] **Step 2: Delete the standalone "Target Length (F2-047)" custom section**

Remove the entire object from the `customSections` array:
```typescript
{
  title: 'Target Length (F2-047)',
  content: `O input pode conter ...`,
},
```

---

## Task 12: Phase 2 — Translate + merge Video Portuguese sections

**Files:**
- Modify: `scripts/agents/video.ts`

This is the heaviest edit — 3 Portuguese sections (~6100 chars) replaced with compressed English merged into `rules.content`.

- [ ] **Step 1: Add compressed dual-output rules to rules.content**

Append these rules to the `rules.content` array (after the existing `content_warning` rule at line 182):

```typescript
'teleprompter_script: Clean narration for the presenter to read in order. Natural speech, short paragraphs, clear transitions. No brackets, no B-roll marks, no TEXT overlays. Section headers like [HOOK - 0:00] are allowed for navigation. Minimum 1500 characters.',
'editor_script: Detailed production guide for the video editor. For each section: A-roll framing, B-roll suggestions with timestamps, text overlays with timing, SFX cues, BGM mood/intensity, visual effects (zoom, jump cut, etc) with rationale, transitions, pacing notes, and color grading. Treat as a briefing for an editor who was not at the shoot.',
'video_title.primary: Max 60 characters with hook + curiosity gap. Alternatives for A/B testing.',
'thumbnail_ideas: 3-5 visually distinct concepts. Each with visual description, text overlay, emotion, color palette, and composition notes.',
'pinned_comment: Specific engagement question related to the theme. Not generic "like and subscribe". Must invite replies.',
'video_description: Minimum 800 characters. Must include: hook paragraph, timestamped topic list, resource links (placeholder if none), CTAs, hashtags.',
```

- [ ] **Step 2: Delete "Dual Output Requirement (F2-045)" custom section**

Remove the entire object starting at line 293:
```typescript
{
  title: 'Dual Output Requirement (F2-045)',
  content: `O output do agente DEVE conter...`,
},
```

- [ ] **Step 3: Delete "Complete YouTube Package (F2-046)" custom section**

Remove the entire object starting at line 381:
```typescript
{
  title: 'Complete YouTube Package (F2-046)',
  content: `Além de \`teleprompter_script\`...`,
},
```

- [ ] **Step 4: Delete "Target Duration (F2-047)" custom section**

Remove the entire object starting at line 470:
```typescript
{
  title: 'Target Duration (F2-047)',
  content: `O input pode conter...`,
},
```

- [ ] **Step 5: Add target duration rule to rules.content**

Append to `rules.content`:
```typescript
'If production_params.target_duration_minutes is provided, scale teleprompter_script to that duration (~150 words/minute). If material is insufficient, set content_warning instead of padding.',
```

---

## Task 13: Phase 2 — Compress Shorts F2-047 section

**Files:**
- Modify: `scripts/agents/shorts.ts`

The Shorts F2-047 section (line 243) is already in English. Compress and merge into `rules.content`.

- [ ] **Step 1: Add target duration rule to rules.content**

Append to the `rules.content` array (after line 84):
```typescript
'If production_params.target_duration_minutes is provided (in tenths), scale each short to that duration. 0.25 (15s) = 35-40 words, 0.5 (30s) = 70-80 words, 1.0 (60s) = 140-150 words. If material is insufficient, set content_warning instead of padding.',
```

- [ ] **Step 2: Delete "Target Duration (F2-047)" custom section**

Remove the entire object at line 243:
```typescript
{
  title: 'Target Duration (F2-047)',
  content: `Shorts are between 15 and 60 seconds...`,
},
```

- [ ] **Step 3: Add content_warning to output schema**

Add after `background_music` field in the shorts arrOf (after line 62):
```typescript
str('content_warning', 'Set if material is insufficient for target duration', false),
```

---

## Task 14: Phase 2 — Compress Podcast F2-047 section

**Files:**
- Modify: `scripts/agents/podcast.ts`

The Podcast F2-047 section (line 168) is already in English. Compress and merge.

- [ ] **Step 1: Add target duration rule to rules.content**

Append to the `rules.content` array (after line 90):
```typescript
'If production_params.target_duration_minutes is provided, scale episode structure to that duration. Each talking_point is roughly 5-7 minutes. If material is insufficient, set content_warning instead of padding.',
```

- [ ] **Step 2: Delete "Target Duration (F2-047)" custom section**

Remove the entire object at line 168:
```typescript
{
  title: 'Target Duration (F2-047)',
  content: `If \`production_params.target_duration_minutes\` is provided...`,
},
```

- [ ] **Step 3: Add content_warning to output schema**

Add after `duration_estimate` field in outputSchema (after line 68):
```typescript
str('content_warning', 'Set if material is insufficient for target duration', false),
```

---

## Task 15: Phase 2 — Verify and Commit

- [ ] **Step 1: Grep for Portuguese words**

```bash
grep -n "conteudo\|conteúdo\|DEVE\|palavras\|campo\|OBRIGAT\|Além\|Roteiro\|apresentador\|Descrição\|Mínimo" scripts/agents/*.ts
```

Expected: 0 matches.

- [ ] **Step 2: Run db:seed**

```bash
npm run db:seed
```

Expected: Seed generation succeeds.

- [ ] **Step 3: Commit**

```bash
git add scripts/agents/blog.ts scripts/agents/video.ts scripts/agents/shorts.ts scripts/agents/podcast.ts
git commit --no-verify -m "refactor(agents): translate Portuguese sections to English, compress and merge into rules

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 16: Phase 3 — Brainstorm hallucination cleanup

**Files:**
- Modify: `scripts/agents/brainstorm.ts:35-39` and `scripts/agents/brainstorm.ts:82-92`

- [ ] **Step 1: Remove monthly_volume_estimate from outputSchema**

Replace lines 35-39:
```typescript
obj('primary_keyword', 'Primary keyword phrase and metrics', [
  str('term', 'Actual keyword phrase people search'),
  str('difficulty', 'low/medium/high'),
  str('monthly_volume_estimate', 'Estimated monthly search volume'),
]),
```

With:
```typescript
obj('primary_keyword', 'Primary keyword phrase and difficulty', [
  str('term', 'Actual keyword phrase people search'),
  str('difficulty', 'low/medium/high'),
]),
```

- [ ] **Step 2: Remove monthly_volume_estimate from Field Quality Guidance**

In the custom section content (around line 88), remove:
```
- **primary_keyword.term**: Actual keyword phrase people search. Not a topic label.
- **primary_keyword.difficulty**: low/medium/high. Be realistic about competition.
```

Replace with:
```
- **primary_keyword.term**: Actual keyword phrase people search. Not a topic label.
- **primary_keyword.difficulty**: low/medium/high. Be realistic about competition. Do not estimate search volume — that data requires external tools.
```

---

## Task 17: Phase 3 — Research hallucination constraints

**Files:**
- Modify: `scripts/agents/research.ts`

- [ ] **Step 1: Add URL constraint to rules.validation**

Append to the `rules.validation` array:
```typescript
'If you cannot verify a URL exists, set sources[].url to empty string. Never fabricate URLs.',
'Only include statistics and quotes you found in sources. If paraphrasing, mark with "[paraphrased]". Never fabricate quotes attributed to real people.',
```

- [ ] **Step 2: Add confidence_score calibration**

Find the `confidence_score` field description in outputSchema (the field `num('confidence_score', 'Confidence score on a 1-10 scale')`) and replace:

```typescript
num('confidence_score', 'Confidence score on a 1-10 scale'),
```

With:
```typescript
num('confidence_score', '1-10 scale: 1-3 weak/unverifiable, 4-6 moderate/partial evidence, 7-9 strong/multiple sources, 10 conclusive/peer-reviewed'),
```

---

## Task 18: Phase 3 — Content Core max argument_chain

**Files:**
- Modify: `scripts/agents/content-core.ts`

- [ ] **Step 1: Update argument_chain description**

Replace line 81:
```typescript
arrOf('argument_chain', 'Ordered logical chain — each step builds on the previous. Min 2 steps.', [
```

With:
```typescript
arrOf('argument_chain', 'Ordered logical chain — each step builds on the previous. Min 2, max 6 steps. Consolidate related claims if research supports more than 6.', [
```

- [ ] **Step 2: Add validation rule**

Append to `rules.validation` array:
```typescript
'Verify argument_chain has 2-6 steps. If research supports more than 6 claims, consolidate related steps.',
```

---

## Task 19: Phase 3 — Blog hallucination cleanup

**Files:**
- Modify: `scripts/agents/blog.ts`

- [ ] **Step 1: Remove word_count from output schema**

Find and remove this line from `outputSchema.fields`:
```typescript
num('word_count', 'Total word count of full_draft (within ±50 words)'),
```

- [ ] **Step 2: Add content_warning to output schema**

Add at the end of `outputSchema.fields` (before the closing `]`):
```typescript
str('content_warning', 'Set if research material is insufficient for the target word count', false),
```

- [ ] **Step 3: Add constraint to internal_links_suggested**

Find the `internal_links_suggested` field and update its description. Replace:
```typescript
arrOf('internal_links_suggested', 'Related topics for interlinking (2-4 recommended)', [
```

With:
```typescript
arrOf('internal_links_suggested', 'Topic suggestions for the content team (2-4). Do not include URLs — these are topic ideas, not links.', [
```

- [ ] **Step 4: Remove word_count from rules.content and Before Finishing**

In `rules.content`, find and remove:
```typescript
'word_count: Must match the actual word count of full_draft (within ±50 words).',
```

In `rules.validation`, find and remove any reference to word_count verification.

---

## Task 20: Phase 3 — Video hallucination cleanup

**Files:**
- Modify: `scripts/agents/video.ts`

- [ ] **Step 1: Rename total_duration_estimate to estimated_duration**

Replace in outputSchema:
```typescript
str('total_duration_estimate', 'e.g., "8-10 minutes"'),
```

With:
```typescript
str('estimated_duration', 'Estimate based on script word count at ~150 words/minute, e.g. "8-10 minutes"'),
```

- [ ] **Step 2: Update rules.content reference**

Replace:
```typescript
'total_duration_estimate: Estimate based on chapter count and content depth (typical: 1 chapter = 2-3 min).',
```

With:
```typescript
'estimated_duration: Calculate from script word count at ~150 words/minute. State as an estimate.',
```

---

## Task 21: Phase 3 — Podcast hallucination cleanup

**Files:**
- Modify: `scripts/agents/podcast.ts`

- [ ] **Step 1: Update personal_angle description**

Replace in outputSchema:
```typescript
str('personal_angle', 'First-person experiential take on the thesis. Not a summary - a genuine reflection or story that makes the thesis personal and relatable.'),
```

With:
```typescript
str('personal_angle', 'First-person framing for the host to personalize. The host will adapt with their real experience.'),
```

- [ ] **Step 2: Update duration_estimate description**

Replace:
```typescript
str('duration_estimate', 'e.g., "20-25 minutes"'),
```

With:
```typescript
str('duration_estimate', 'Rough estimate based on talking point count (~5-7 min each). Not a production target.'),
```

---

## Task 22: Phase 3 — Engagement fallback rule

**Files:**
- Modify: `scripts/agents/engagement.ts`

- [ ] **Step 1: Add key_stats fallback to rules.content**

Append to `rules.content` array:
```typescript
'If key_stats is empty or not provided, use qualitative claims from the thesis or argument_chain evidence instead. Do not fabricate statistics.',
```

---

## Task 23: Phase 3 — Review hallucination cleanup

**Files:**
- Modify: `scripts/agents/review.ts`

- [ ] **Step 1: Remove recommended_publish_date from blog publication plan**

In the `publication_plan.blog` object (around line 148), remove:
```typescript
str('recommended_publish_date', 'YYYY-MM-DD format', false),
str('publish_time', 'HH:MM timezone format', false),
```

- [ ] **Step 2: Remove recommended_publish_date from youtube publication plan**

In the `publication_plan.youtube` object (around line 163), remove:
```typescript
str('recommended_publish_date', 'YYYY-MM-DD format', false),
str('publish_time', 'HH:MM format', false),
```

- [ ] **Step 3: Remove publish dates from shorts publication plan**

In the `publication_plan.shorts` arrOf (around line 175), remove:
```typescript
str('publish_date', 'YYYY-MM-DD format'),
str('publish_time', 'HH:MM format'),
```

- [ ] **Step 4: Remove publish dates from podcast publication plan**

In the `publication_plan.podcast` object (around line 182), remove:
```typescript
str('recommended_publish_date', 'YYYY-MM-DD format', false),
```

- [ ] **Step 5: Remove target_url from internal_links**

In `publication_plan.blog.internal_links` arrOf (around line 155), remove:
```typescript
str('target_url', 'Target URL'),
```

Keep `anchor_text` only. Update the description of `internal_links` to clarify these are topic suggestions:
```typescript
arrOf('internal_links', 'Internal link topic suggestions (content team will add actual URLs)', [
  str('anchor_text', 'Suggested link text'),
], false),
```

- [ ] **Step 6: Remove cross_promotion dates**

In `publication_plan.cross_promotion` (around line 186), remove:
```typescript
str('twitter_thread_date', 'Publication date for Twitter thread', false),
str('community_post_date', 'Publication date for community post', false),
```

Keep only:
```typescript
obj('cross_promotion', 'Cross-promotion strategy', [
  str('newsletter_mention', 'Newsletter mention details', false),
], false),
```

- [ ] **Step 7: Update Publication Plan custom section**

In the "Field Guidance: Publication Plan" custom section, remove references to specific dates and times. Replace the date-specific guidance with:
```
Publication timing should be determined by the content team based on their calendar and analytics.
```

---

## Task 24: Phase 3 — Verify and Commit

- [ ] **Step 1: Verify removals**

```bash
grep -n "monthly_volume_estimate" scripts/agents/brainstorm.ts
grep -n "recommended_publish_date\|publish_time\|target_url\|twitter_thread_date\|community_post_date" scripts/agents/review.ts
grep -n "word_count" scripts/agents/blog.ts | grep -v "word_count_target\|target_word_count"
```

Expected: 0 matches for each.

- [ ] **Step 2: Run db:seed**

```bash
npm run db:seed
```

Expected: Seed generation succeeds.

- [ ] **Step 3: Commit**

```bash
git add scripts/agents/brainstorm.ts scripts/agents/research.ts scripts/agents/content-core.ts scripts/agents/blog.ts scripts/agents/video.ts scripts/agents/podcast.ts scripts/agents/engagement.ts scripts/agents/review.ts
git commit --no-verify -m "refactor(agents): remove hallucination-prone fields, add constraints and calibration

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 25: Phase 4 — Expand Review input schema

**Files:**
- Modify: `scripts/agents/review.ts:44-65`

- [ ] **Step 1: Expand blog input fields**

Replace the blog object (lines 45-50):
```typescript
obj('blog', 'Blog content', [
  str('title', 'Blog post title', false),
  str('meta_description', 'SEO meta description', false),
  str('full_draft', 'Complete blog content', false),
  num('word_count', 'Word count', false),
], false),
```

With:
```typescript
obj('blog', 'Blog content', [
  str('title', 'Blog post title', false),
  str('slug', 'URL slug — verify lowercase, hyphens only, no special chars', false),
  str('meta_description', 'SEO meta description', false),
  str('primary_keyword', 'Primary SEO keyword — verify presence in title and meta_description', false),
  str('full_draft', 'Complete blog content', false),
], false),
```

Note: `word_count` removed (Phase 3), `slug` and `primary_keyword` added.

- [ ] **Step 2: Expand video input fields**

Replace the video object (lines 51-55):
```typescript
obj('video', 'Video content', [
  arr('title_options', 'Optional video title variants', 'string', false),
  obj('script', 'Video script structure', [], false),
  str('total_duration_estimate', 'Estimated video duration', false),
], false),
```

With:
```typescript
obj('video', 'Video content', [
  arr('title_options', 'Video title variants', 'string', false),
  obj('script', 'Video script structure', [], false),
  str('estimated_duration', 'Estimated video duration', false),
  obj('thumbnail', 'Thumbnail design for review', [
    str('text_overlay', 'Text on thumbnail', false),
    str('emotion', 'Emotion: curiosity | shock | intrigue', false),
    str('visual_style', 'Visual style description', false),
  ], false),
  num('chapter_count', 'Number of chapters in the script', false),
], false),
```

Note: `total_duration_estimate` renamed to `estimated_duration` (Phase 3).

- [ ] **Step 3: Change shorts from array of strings to array of objects**

Replace (line 56):
```typescript
arr('shorts', 'Short-form video content', 'string', false),
```

With:
```typescript
arrOf('shorts', 'Short-form video content', [
  str('hook', 'The scroll-stopping opening', false),
  str('script', 'Complete short script', false),
  str('visual_style', 'talking head | b-roll | text overlay', false),
  str('duration_target', 'Target duration', false),
], false),
```

- [ ] **Step 4: Expand podcast input fields**

Replace the podcast object (lines 57-60):
```typescript
obj('podcast', 'Podcast episode content', [
  str('episode_title', 'Episode title', false),
  arr('talking_points', 'Episode talking points', 'string', false),
], false),
```

With:
```typescript
obj('podcast', 'Podcast episode content', [
  str('episode_title', 'Episode title', false),
  arr('talking_points', 'Episode talking points', 'string', false),
  str('intro_hook', 'Opening hook for quality assessment', false),
  str('outro', 'Closing remarks — verify CTA inclusion', false),
], false),
```

- [ ] **Step 5: Expand engagement input fields**

Replace the engagement object (lines 61-64):
```typescript
obj('engagement', 'Engagement assets', [
  str('pinned_comment', 'YouTube pinned comment', false),
  str('community_post', 'Community post content', false),
], false),
```

With:
```typescript
obj('engagement', 'Engagement assets', [
  str('pinned_comment', 'YouTube pinned comment', false),
  str('community_post', 'Community post content', false),
  str('hook_tweet', 'Opening tweet of Twitter thread', false),
  arr('thread_outline', 'Supporting tweets in the thread', 'string', false),
], false),
```

---

## Task 26: Phase 4 — Update Review custom sections

**Files:**
- Modify: `scripts/agents/review.ts` custom sections

- [ ] **Step 1: Update Blog Review guidance**

In the "Field Guidance: Blog Review" custom section, append to the SEO check guidance:
```
- slug: Verify URL-safe (lowercase, hyphens, no spaces or special chars)
- primary_keyword: Verify it appears naturally in title, meta_description, and full_draft
```

- [ ] **Step 2: Update Shorts Review guidance**

In the "Field Guidance: Shorts Review" custom section, update the assessment criteria to mention:
```
For each short, also assess:
- hook: Does it stop the scroll in 1-2 seconds?
- visual_style: Is it consistent across shorts? Does it match the content type?
```

- [ ] **Step 3: Update Engagement Review guidance**

In the "Field Guidance: Engagement Review" custom section, add after the community_post guidance:
```
hook_tweet (Twitter/X):
- Is it the most provocative restatement of the thesis?
- 1-2 sentences, no hashtags, no thread numbering
- Would it stop the scroll?

thread_outline:
- 4-6 tweets expanding the argument
- Each under 280 characters
- Last tweet is CTA
- Stats used match key_stats from research
```

---

## Task 27: Phase 4 — Verify and Commit

- [ ] **Step 1: Verify schema changes**

```bash
grep -n "slug\|primary_keyword" scripts/agents/review.ts | head -10
grep -n "hook_tweet\|thread_outline" scripts/agents/review.ts | head -10
grep -n "arrOf.*shorts" scripts/agents/review.ts
grep -n "intro_hook\|outro" scripts/agents/review.ts | head -10
```

Expected: New fields visible in inputSchema.

- [ ] **Step 2: Run db:seed**

```bash
npm run db:seed
```

Expected: Seed generation succeeds.

- [ ] **Step 3: Commit**

```bash
git add scripts/agents/review.ts
git commit --no-verify -m "feat(agents): expand Review input schema for meaningful content assessment

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 28: Final Verification

- [ ] **Step 1: Run full db:seed and verify all agents**

```bash
npm run db:seed
```

- [ ] **Step 2: Run grep for all known issues**

```bash
# No Portuguese
grep -rn "conteudo\|conteúdo\|DEVE\|palavras\|OBRIGAT\|Além\|Roteiro" scripts/agents/*.ts

# No duplicated formatting rules outside _helpers.ts
grep -n "em-dashes\|curly quotes" scripts/agents/*.ts | grep -v "_helpers.ts"

# No removed hallucination fields
grep -n "monthly_volume_estimate" scripts/agents/*.ts
grep -n "recommended_publish_date\|publish_time\b" scripts/agents/review.ts
grep -n "target_url" scripts/agents/review.ts

# Review has expanded fields
grep -n "slug\|primary_keyword\|hook_tweet\|thread_outline\|intro_hook\|chapter_count" scripts/agents/review.ts
```

- [ ] **Step 3: Verify final state**

```bash
git log --oneline -5
```

Expected: 5 commits — prerequisite + Phase 1 + Phase 2 + Phase 3 + Phase 4.
