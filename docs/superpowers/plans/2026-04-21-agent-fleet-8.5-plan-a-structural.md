# Agent Fleet 8.5+ — Plan A: Structural Changes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename fabrication-prone fields (Theme 6), align Review agent inputSchema with full production types (Theme 1), and replace Review's subjective numeric `score` with a deterministic `quality_tier` enum + rubric (Theme 2).

**Architecture:**
- Agent seed files live in `scripts/agents/*.ts` and feed `supabase/seed.sql` via `scripts/generate-seed.ts`.
- Agent runtime prompt builder in `apps/api/src/lib/ai/prompts/review.ts` passes the raw production JSON verbatim to the LLM — no runtime field filtering. "Mapper alignment" here means declaring the fields in the agent's JSON inputSchema so the LLM knows to reference them.
- UI consumers: `ReviewEngine.tsx` (quality_tier + rubric), `BrainstormEngine.tsx` / `BrainstormForm.tsx` (monetization_hypothesis label), `PodcastForm.tsx` (host_talking_prompts bullet list).
- Legacy dual-read: existing drafts in `content_drafts.review_feedback_json` may contain numeric `score`. UI and aggregation logic accept both shapes for 30 days.

**Tech Stack:** TypeScript, Next.js 16, Zod, Vitest, Supabase, tsx (seed generator).

**Companion spec:** `docs/superpowers/specs/2026-04-21-agent-fleet-8.5-design.md`

**Plan B (polish — themes 3/4/5):** to be written after Plan A implementation.

---

## File Structure

### Modify
- `scripts/agents/brainstorm.ts` — rename `monetization` block to `monetization_hypothesis`, update guidance
- `scripts/agents/podcast.ts` — replace `personal_angle` string field with `host_talking_prompts` array
- `scripts/agents/review.ts` — expand inputSchema for blog/video/podcast; replace `score: number` with `quality_tier: enum` + `rubric_checks`; add malformed-input rules; deterministic rubric rule
- `packages/shared/src/types/agents.ts` — update `BrainstormIdea`, `PodcastOutput`, `ReviewOutput`, `mapBrainstormToResearchInput` types
- `packages/shared/src/schemas/review.ts` — replace stale Zod schema with one matching the new agent contract
- `apps/app/src/components/engines/ReviewEngine.tsx` — replace `score >= 90` threshold with `quality_tier in ('excellent','good')`; support dual-read for legacy scores
- `apps/app/src/components/pipeline/PipelineOrchestrator.tsx` — update any pipeline logic that reads review score (verify paths)
- `apps/app/src/components/production/ProductionForm.tsx` — update podcast form for `host_talking_prompts` array input
- `apps/app/src/components/research/ResearchForm.tsx` — update if it reads `monetization.*` from brainstorm output
- `supabase/seed.sql` — regenerated via `npm run db:seed`

### Create
- `packages/shared/src/mappers/__tests__/agentContracts.test.ts` — round-trip tests asserting Review inputSchema declares all fields present in the production types
- `packages/shared/src/utils/reviewTierCompat.ts` — dual-read helper `deriveTier(review)` that accepts legacy `{score: number}` or new `{quality_tier}` and returns a unified tier

### Reference (no change expected but verify)
- `apps/api/src/lib/ai/prompts/review.ts` — prompt builder is already pass-through; should not need changes
- `apps/api/src/routes/content-drafts.ts` — check for any `review_score` read paths

---

## Task 1: Snapshot current agent output + seed regeneration baseline

**Files:**
- Read: `scripts/agents/brainstorm.ts`, `scripts/agents/podcast.ts`, `scripts/agents/review.ts`
- Run: `npm run db:seed --dry-run` (if supported) or `npm run typecheck`

- [ ] **Step 1: Confirm current working tree is clean for branch**

Run: `git status`
Expected: on `feat/v2-001-primary-keyword` with known modifications (`package.json`, `supabase/seed.sql`, audit files). No merge conflicts.

- [ ] **Step 2: Run typecheck baseline to ensure green starting point**

Run: `npm run typecheck`
Expected: zero errors. If errors exist, stop and investigate — all Plan A tasks assume a green baseline.

- [ ] **Step 3: Record baseline Review schema line count**

Run: `wc -l scripts/agents/review.ts`
Expected: 528 lines. Save this number as the "before" count — Task 14 (compression) references it.

- [ ] **Step 4: Commit any unrelated pending work first**

If `package.json` or `supabase/seed.sql` contain unrelated changes, commit them separately before starting Plan A. This keeps Plan A's commits surgical.

No code change in this task; it's a setup gate.

---

## Task 2: Rename Brainstorm `monetization` → `monetization_hypothesis` (type)

**Files:**
- Modify: `packages/shared/src/types/agents.ts` (BrainstormIdea interface + `mapBrainstormToResearchInput`)

- [ ] **Step 1: Locate `BrainstormIdea` interface**

Grep for: `export interface BrainstormIdea`
Expected location: `packages/shared/src/types/agents.ts` near line ~100-150.

- [ ] **Step 2: Rename the field**

Find the block (approximate shape):

```typescript
monetization: {
  affiliate_angle: string;
  product_fit?: string;
  sponsor_appeal?: string;
};
```

Replace with:

```typescript
monetization_hypothesis: {
  affiliate_angle: string;
  product_categories?: string[];
  sponsor_category?: string;
};
```

Notes:
- `product_fit: string` → `product_categories: string[]` (forces generic categories, not single-brand naming).
- `sponsor_appeal: string` → `sponsor_category: string` (category framing only).

- [ ] **Step 3: Update `mapBrainstormToResearchInput`**

Find (at `packages/shared/src/types/agents.ts:641`):

```typescript
monetization: {
  affiliate_angle: idea.monetization.affiliate_angle,
},
```

Replace with:

```typescript
monetization_hypothesis: {
  affiliate_angle: idea.monetization_hypothesis.affiliate_angle,
},
```

Also update `SelectedIdeaForResearch` type if it references `monetization.*` — rename the field there to match.

- [ ] **Step 4: Run typecheck — expect failures downstream**

Run: `npm run typecheck`
Expected: FAIL with errors in any consumer that reads `.monetization.*`. List the failing files — they are handled in Task 3.

- [ ] **Step 5: Commit intermediate state**

Do NOT commit yet — wait until Task 3 fixes consumers.

---

## Task 3: Propagate monetization rename to consumers

**Files:**
- Modify: `apps/app/src/components/research/ResearchForm.tsx` (if it reads `monetization.*`)
- Modify: `apps/app/src/components/production/ProductionForm.tsx` (if it reads `monetization.*`)
- Modify: any other file reported by Task 2 Step 4 typecheck

- [ ] **Step 1: List every file that references the old field**

Use Grep with pattern: `monetization\.(affiliate_angle|product_fit|sponsor_appeal)` in `apps/` and `packages/`.
Expected: 2-5 files.

- [ ] **Step 2: For each file, rename `monetization` → `monetization_hypothesis`**

Also rename `product_fit` → `product_categories` (convert single string → string[]) and `sponsor_appeal` → `sponsor_category`.

If a consumer displays these fields in a user-facing label, add the warning:

```tsx
<Label className="text-muted-foreground">
  Monetization hypothesis
  <span className="ml-2 text-xs italic">AI speculation — verify before outreach.</span>
</Label>
```

- [ ] **Step 3: Run typecheck — expect green**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: PASS (no tests reference the old fields unless they exist — update them if failing).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/agents.ts apps/app/src/components/**
git commit -m "$(cat <<'EOF'
refactor(agents): rename monetization → monetization_hypothesis

Rename field across BrainstormIdea type + downstream consumers. Restructures
product_fit (string) → product_categories (string[]) and sponsor_appeal
(string) → sponsor_category (string) to force generic category framing and
prevent fabricated brand names. UI labels now flag AI speculation.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update Brainstorm agent seed for renamed field

**Files:**
- Modify: `scripts/agents/brainstorm.ts`

- [ ] **Step 1: Locate the monetization block in the seed**

Grep: `monetization` in `scripts/agents/brainstorm.ts`.

- [ ] **Step 2: Rename in outputSchema**

Replace the existing `obj('monetization', ...)` with:

```typescript
obj('monetization_hypothesis', 'Directional monetization hypotheses — AI speculation only, not verified brand fit data.', [
  str('affiliate_angle', 'Short phrase describing what affiliate category this idea could support (e.g., "outdoor gear", "SaaS productivity tools"). Generic categories only, never specific brand names unless the user provided them.'),
  arr('product_categories', 'Array of generic product categories this idea might fit. Max 5. Never name specific companies.', 'string', false),
  str('sponsor_category', 'Generic sponsor category (e.g., "B2B analytics platforms", "hiking apparel"). Never name specific companies unless user provided them.', false),
]),
```

- [ ] **Step 3: Update any custom section referencing monetization**

Search the file for the word `monetization` in customSections, principles, or rules. Rename to `monetization_hypothesis` and add the rule: "Never name specific companies or brands unless the user explicitly provided them in their message."

- [ ] **Step 4: Run seed generator (dry validation)**

Run: `npx tsx scripts/generate-seed.ts --check`
Expected: if the `--check` flag isn't supported, just run `npx tsx scripts/generate-seed.ts` and manually diff the result.

- [ ] **Step 5: Commit**

```bash
git add scripts/agents/brainstorm.ts
git commit -m "$(cat <<'EOF'
refactor(agents): rename brainstorm monetization field in seed

Matches BrainstormIdea type rename. Restructures sub-fields to enforce
generic categories only. Adds explicit "no specific brands" rule.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Convert Podcast `personal_angle` → `host_talking_prompts[]` (type)

**Files:**
- Modify: `packages/shared/src/types/agents.ts` (PodcastOutput interface, line ~345)

- [ ] **Step 1: Locate `PodcastOutput`**

Current shape (at line 345):

```typescript
export interface PodcastOutput {
  episode_title: string;
  episode_description: string;
  intro_hook: string;
  talking_points: Array<{
    point: string;
    notes: string;
  }>;
  personal_angle: string;
  guest_questions: string[];
  outro: string;
  duration_estimate: string;
}
```

- [ ] **Step 2: Replace `personal_angle` field**

```typescript
export interface PodcastOutput {
  episode_title: string;
  episode_description: string;
  intro_hook: string;
  talking_points: Array<{
    point: string;
    notes: string;
  }>;
  host_talking_prompts: string[];  // renamed from personal_angle
  guest_questions: string[];
  outro: string;
  duration_estimate: string;
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: FAIL — consumers of `personal_angle` break.

---

## Task 6: Propagate podcast rename to consumers + agent seed

**Files:**
- Modify: `scripts/agents/podcast.ts`
- Modify: `apps/app/src/components/production/ProductionForm.tsx` (if podcast block exists)
- Modify: any other file flagged by typecheck

- [ ] **Step 1: Update podcast agent seed outputSchema**

In `scripts/agents/podcast.ts`, find the `personal_angle` field definition and replace with:

```typescript
arr('host_talking_prompts',
  'Array of 2-4 invitation-style prompts for the host to personalize with real experience. Phrase each as an invitation ("Share a time when...", "Describe how you reacted to..."), NEVER as fabricated first-person statements. The host supplies the actual story.',
  'string'),
```

- [ ] **Step 2: Update podcast agent customSections**

Find any customSection titled "Personal Angle" or mentioning `personal_angle`. Rename title to "Host Talking Prompts". Replace all guidance with:

```
- Return 2-4 invitation prompts.
- Each prompt frames a moment the host can fill from their own experience.
- Never fabricate first-person claims. "Share a time when you..." — not "I once had...".
- Prompts reference the thesis or argument_chain steps so they tie into the episode.
```

- [ ] **Step 3: Update podcast `rules.validation`**

Add:

```typescript
'host_talking_prompts must contain 2-4 items. Each item must be an invitation phrase — must not start with "I " or contain "my" in a first-person claim.',
```

- [ ] **Step 4: Update any UI consumer**

In `apps/app/src/components/production/ProductionForm.tsx`, if a field renders podcast.personal_angle, replace with a bullet list rendering host_talking_prompts:

```tsx
<div>
  <Label>Prompts for the host to personalize</Label>
  <ul className="list-disc pl-5 text-sm">
    {podcast.host_talking_prompts.map((p, i) => (
      <li key={i}>{p}</li>
    ))}
  </ul>
</div>
```

- [ ] **Step 5: Run typecheck + tests**

Run: `npm run typecheck && npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/agents.ts scripts/agents/podcast.ts apps/app/src/components/**
git commit -m "$(cat <<'EOF'
refactor(agents): podcast personal_angle → host_talking_prompts

Replaces fabricated first-person string with array of invitation prompts.
The host supplies real experience; agent only scaffolds. Updates type,
seed, validation rule, and UI consumer.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Expand Review inputSchema — Blog block

**Files:**
- Modify: `scripts/agents/review.ts` (lines 44-51)

- [ ] **Step 1: Locate current blog inputSchema**

At `scripts/agents/review.ts:44-51`:

```typescript
obj('blog', 'Blog content', [
  str('title', 'Blog post title', false),
  str('slug', 'URL slug — verify lowercase, hyphens only, no special chars', false),
  str('meta_description', 'SEO meta description', false),
  str('primary_keyword', 'Primary SEO keyword — verify presence in title and meta_description', false),
  str('full_draft', 'Complete blog content', false),
], false),
```

- [ ] **Step 2: Expand with missing fields**

Replace with:

```typescript
obj('blog', 'Blog content', [
  str('title', 'Blog post title', false),
  str('slug', 'URL slug — verify lowercase, hyphens only, no special chars', false),
  str('meta_description', 'SEO meta description', false),
  str('primary_keyword', 'Primary SEO keyword — verify presence in title and meta_description', false),
  arr('secondary_keywords', 'Supporting keywords — verify at least one appears in body', 'string', false),
  arrOf('outline', 'Outline sections — verify each has key_points and realistic word_count_target', [
    str('h2', 'Section heading', false),
    arr('key_points', 'Bullet points for this section', 'string', false),
    num('word_count_target', 'Target word count for this section', false),
  ], false),
  str('full_draft', 'Complete blog content', false),
  obj('affiliate_integration', 'Affiliate placement — verify placement enum and non-empty copy', [
    str('placement', 'intro | middle | conclusion', false),
    str('copy', 'Affiliate copy', false),
    str('product_link_placeholder', 'Placeholder for affiliate URL', false),
    str('rationale', 'Why this placement', false),
  ], false),
  arrOf('internal_links_suggested', 'Internal link ideas — verify topics, not URLs', [
    str('topic', 'Suggested link topic', false),
    str('anchor_text', 'Anchor text', false),
  ], false),
], false),
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

---

## Task 8: Expand Review inputSchema — Video block

**Files:**
- Modify: `scripts/agents/review.ts` (lines 52-62)

- [ ] **Step 1: Locate current video block**

At `scripts/agents/review.ts:52-62`:

```typescript
obj('video', 'Video content', [
  arr('title_options', 'Video title variants', 'string', false),
  obj('script', 'Video script structure', [], false),
  str('estimated_duration', 'Estimated video duration', false),
  obj('thumbnail', 'Thumbnail design for review', [...], false),
  num('chapter_count', 'Number of chapters in the script', false),
], false),
```

- [ ] **Step 2: Replace with expanded block**

```typescript
obj('video', 'Video content', [
  arr('title_options', 'Video title variants — verify count is exactly 3', 'string', false),
  obj('script', 'Video script structure', [
    obj('hook', 'Opening hook', [
      str('duration', 'Hook duration'),
      str('content', 'Hook content text'),
      str('visual_notes', 'Visual direction'),
    ], false),
    obj('problem', 'Problem statement section', [
      str('duration', 'Duration'),
      str('content', 'Content'),
      str('visual_notes', 'Visual direction'),
    ], false),
    arrOf('chapters', 'Chapter breakdown — verify each has content and duration', [
      num('chapter_number', '1-indexed'),
      str('title', 'Chapter title'),
      str('duration', 'Chapter duration'),
      str('content', 'Chapter content'),
      arr('b_roll_suggestions', 'B-roll ideas', 'string', false),
      str('key_stat_or_quote', 'Key stat or quote', false),
    ], false),
    obj('outro', 'Outro section with CTA — verify CTA presence', [
      str('cta', 'Call to action text', false),
      str('end_screen_prompt', 'End screen prompt', false),
    ], false),
  ], false),
  str('teleprompter_script', 'Full teleprompter-ready script — verify length plausible for chapter_count', false),
  str('video_description', 'YouTube video description — verify has timestamps if chapter_count > 1', false),
  str('estimated_duration', 'Estimated video duration', false),
  obj('thumbnail', 'Thumbnail design', [
    str('text_overlay', 'Text on thumbnail', false),
    str('emotion', 'curiosity | shock | intrigue', false),
    str('visual_style', 'Visual style description', false),
  ], false),
  num('chapter_count', 'Number of chapters in the script', false),
  str('pinned_comment', 'YouTube pinned comment if produced here', false),
], false),
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

---

## Task 9: Expand Review inputSchema — Podcast block

**Files:**
- Modify: `scripts/agents/review.ts` (lines 69-74)

- [ ] **Step 1: Locate podcast block**

At `scripts/agents/review.ts:69-74`:

```typescript
obj('podcast', 'Podcast episode content', [
  str('episode_title', 'Episode title', false),
  arr('talking_points', 'Episode talking points', 'string', false),
  str('intro_hook', 'Opening hook for quality assessment', false),
  str('outro', 'Closing remarks — verify CTA inclusion', false),
], false),
```

- [ ] **Step 2: Replace with expanded block**

```typescript
obj('podcast', 'Podcast episode content', [
  str('episode_title', 'Episode title', false),
  str('episode_description', 'Episode description — verify hook matches intro_hook', false),
  str('intro_hook', 'Opening hook — verify 1st or 2nd person framing', false),
  arrOf('talking_points', 'Episode talking points with notes', [
    str('point', 'Talking point'),
    str('notes', 'Supporting notes'),
  ], false),
  arr('host_talking_prompts', 'Invitation prompts for host — verify none are fabricated first-person claims', 'string', false),
  arr('guest_questions', 'Guest interview questions', 'string', false),
  str('outro', 'Closing remarks — verify contains a subscribe/follow CTA verb', false),
  str('duration_estimate', 'Rough duration estimate', false),
], false),
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit Tasks 7-9**

```bash
git add scripts/agents/review.ts
git commit -m "$(cat <<'EOF'
feat(agents): expand Review inputSchema for Blog/Video/Podcast

Declares all production fields to the LLM so it can assess slug safety,
keyword coverage, chapter structure, and CTA presence. Runtime already
passes full JSON; this aligns the contract the model sees with what's
actually available.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Add missing-field validation rule to Review

**Files:**
- Modify: `scripts/agents/review.ts` (rules.validation array)

- [ ] **Step 1: Locate `rules.validation` array in review seed**

Grep for: `validation:` in `scripts/agents/review.ts`.

- [ ] **Step 2: Add rule**

Append to the validation array:

```typescript
'If any declared input field under production.{type} is null, undefined, or empty, set that content type\'s quality_tier to "needs_revision" and add critical_issue: "Missing required field: {type}.{field}". Do not silently skip.',
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck`
Commit:

```bash
git add scripts/agents/review.ts
git commit -m "feat(agents): flag missing review input fields as critical issues

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Write failing test for Review inputSchema coverage

**Files:**
- Create: `packages/shared/src/mappers/__tests__/agentContracts.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { review } from '../../../../../scripts/agents/review';

function collectFieldNames(fields: any[], prefix = ''): string[] {
  const names: string[] = [];
  for (const f of fields) {
    const name = prefix ? `${prefix}.${f.name}` : f.name;
    names.push(name);
    if (f.type === 'object' && Array.isArray(f.fields)) {
      names.push(...collectFieldNames(f.fields, name));
    }
    if (f.type === 'array' && f.items?.type === 'object' && Array.isArray(f.items.fields)) {
      names.push(...collectFieldNames(f.items.fields, name + '[]'));
    }
  }
  return names;
}

describe('Review agent inputSchema', () => {
  const productionField = review.sections.inputSchema.fields.find((f) => f.name === 'production');
  if (!productionField || productionField.type !== 'object' || !productionField.fields) {
    throw new Error('production field missing');
  }
  const allFields = collectFieldNames(productionField.fields);

  it('declares required Blog fields', () => {
    for (const f of ['blog.title', 'blog.slug', 'blog.meta_description', 'blog.primary_keyword',
                     'blog.secondary_keywords', 'blog.outline', 'blog.full_draft',
                     'blog.affiliate_integration', 'blog.internal_links_suggested']) {
      expect(allFields).toContain(f);
    }
  });

  it('declares required Video fields', () => {
    for (const f of ['video.title_options', 'video.script', 'video.teleprompter_script',
                     'video.video_description', 'video.estimated_duration', 'video.thumbnail',
                     'video.chapter_count']) {
      expect(allFields).toContain(f);
    }
  });

  it('declares required Podcast fields', () => {
    for (const f of ['podcast.episode_title', 'podcast.episode_description', 'podcast.intro_hook',
                     'podcast.talking_points', 'podcast.host_talking_prompts',
                     'podcast.guest_questions', 'podcast.outro']) {
      expect(allFields).toContain(f);
    }
  });

  it('declares required Shorts fields (arrOf)', () => {
    const shorts = productionField.fields.find((f) => f.name === 'shorts');
    expect(shorts?.type).toBe('array');
    expect(shorts?.items?.type).toBe('object');
    const shortsFields = shorts?.items?.fields?.map((f: any) => f.name) ?? [];
    expect(shortsFields).toEqual(expect.arrayContaining(['hook', 'script', 'visual_style', 'duration_target']));
  });

  it('declares required Engagement fields', () => {
    for (const f of ['engagement.pinned_comment', 'engagement.community_post',
                     'engagement.hook_tweet', 'engagement.thread_outline']) {
      expect(allFields).toContain(f);
    }
  });
});
```

Note: the import path reaches across the monorepo into `scripts/agents/`. If Vitest's TypeScript resolution balks, relax the import to read the seed via `scripts/generate-seed.ts`'s exports instead, or copy the `review` agent definition into a shared location that both the script and the test import from.

- [ ] **Step 2: Run test**

Run: `npx vitest run packages/shared/src/mappers/__tests__/agentContracts.test.ts`
Expected: PASS (Tasks 7-9 already added the fields; this test protects against regression).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/mappers/__tests__/agentContracts.test.ts
git commit -m "test(agents): lock review inputSchema coverage

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 12: Replace `score: number` with `quality_tier: enum` in Review outputSchema

**Files:**
- Modify: `scripts/agents/review.ts` (all `*_review` outputSchema blocks — 5 blocks: blog_review, video_review, shorts_review, podcast_review, engagement_review)

- [ ] **Step 1: Find every `num('score', ...)` in review.ts**

Grep: `num\('score'` in `scripts/agents/review.ts`.
Expected: 5 matches (one per content type review block), plus possibly an `overall` score.

- [ ] **Step 2: Replace each `num('score', ...)` line**

For each `*_review` block, replace:

```typescript
num('score', '1-100 score (0 if not_requested)'),
```

With:

```typescript
str('quality_tier', 'Quality tier: excellent | good | needs_revision | reject | not_requested. Derived from rubric_checks (see rules.validation).'),
```

- [ ] **Step 3: Add `rubric_checks` object to each `*_review` block**

In every `*_review` block, add immediately after `quality_tier`:

```typescript
obj('rubric_checks', 'Rubric breakdown that determines quality_tier', [
  arr('critical_issues', 'Must-fix issues (blockers for publication)', 'string'),
  arr('minor_issues', 'Nice-to-fix issues', 'string'),
  arr('strengths', 'What the content does well', 'string'),
], false),
```

- [ ] **Step 4: Update `overall_verdict` to use same enum**

Find:

```typescript
str('overall_verdict', 'Overall verdict: approved | revision_required | rejected'),
```

Replace with:

```typescript
str('overall_verdict', 'Aggregate verdict across all requested types: approved | revision_required | rejected. Set approved only if every requested type has quality_tier in (excellent, good).'),
```

Keep the string wrapping of enum values for consistency with sibling fields.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (agent seeds are self-contained; type errors come later when UI reads score).

---

## Task 13: Add deterministic rubric derivation rule

**Files:**
- Modify: `scripts/agents/review.ts` (rules.validation)

- [ ] **Step 1: Append rubric rules to validation**

Add these strings to the `rules.validation` array:

```typescript
'quality_tier is derived deterministically from rubric_checks: 0 critical + ≤2 minor → excellent. 0 critical + 3-5 minor → good. 1-2 critical OR ≥6 minor → needs_revision. 3+ critical → reject.',
'If a content type is not in content_types_requested, set its quality_tier to "not_requested" and rubric_checks to empty arrays.',
'overall_verdict must be "approved" only when every type in content_types_requested has quality_tier in (excellent, good). "revision_required" when any requested type is needs_revision. "rejected" when any requested type is reject.',
'ready_to_publish is true only when overall_verdict is "approved".',
```

- [ ] **Step 2: Remove any stale `score`-based rule**

Grep: `score.*90|score.*75|1-100` in `scripts/agents/review.ts`.
Remove matches — they refer to the old scoring.

- [ ] **Step 3: Typecheck + commit Task 12-13**

Run: `npm run typecheck`
Commit:

```bash
git add scripts/agents/review.ts
git commit -m "$(cat <<'EOF'
feat(agents): review scoring → quality_tier enum + rubric_checks

Replaces subjective 0-100 score with deterministic 4-tier enum derived
from counted critical_issues / minor_issues. Same content now produces
the same tier across runs (fixes idempotency).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Add malformed-input guardrails to Review

**Files:**
- Modify: `scripts/agents/review.ts` (rules.content)

- [ ] **Step 1: Append malformed-input rules**

Add to `rules.content`:

```typescript
'If the production object or a required sub-object is missing entirely, set overall_verdict to "rejected" and add critical_issue: "Missing production payload for {type}".',
'If content_types_requested contains a type not present in production, flag as critical_issue on the overall notes: "Requested type \\"{type}\\" was not produced".',
'Never invent a sub-field that is null or undefined in the input. If you cannot assess a field, note it in minor_issues instead of fabricating an assessment.',
```

- [ ] **Step 2: Typecheck + commit**

```bash
git add scripts/agents/review.ts
git commit -m "feat(agents): review handles malformed production input

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 15: Update Zod schema for Review output

**Files:**
- Modify: `packages/shared/src/schemas/review.ts`

- [ ] **Step 1: Replace the existing stale schemas**

The current file defines `reviewOutputBlogVideoSchema` and `reviewOutputPublicationSchema` which don't match the actual agent contract. Replace the full file contents with:

```typescript
import { z } from 'zod';

export const qualityTierSchema = z.enum([
  'excellent',
  'good',
  'needs_revision',
  'reject',
  'not_requested',
]);

export type QualityTier = z.infer<typeof qualityTierSchema>;

export const rubricChecksSchema = z.object({
  critical_issues: z.array(z.string()),
  minor_issues: z.array(z.string()),
  strengths: z.array(z.string()),
});

export type RubricChecks = z.infer<typeof rubricChecksSchema>;

const contentReviewShape = {
  verdict: z.string().optional(),
  quality_tier: qualityTierSchema.optional(),
  rubric_checks: rubricChecksSchema.optional(),
  strengths: z.array(z.string()).optional(),
  issues: z.unknown().optional(),
  notes: z.string().optional(),
};

export const reviewOutputSchema = z.object({
  idea_id: z.string(),
  overall_verdict: z.enum(['approved', 'revision_required', 'rejected']),
  overall_notes: z.string(),
  blog_review: z.object(contentReviewShape).optional(),
  video_review: z.object(contentReviewShape).optional(),
  shorts_review: z.object(contentReviewShape).optional(),
  podcast_review: z.object(contentReviewShape).optional(),
  engagement_review: z.object(contentReviewShape).optional(),
  ready_to_publish: z.boolean(),
});

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

export function validateReviewOutput(data: unknown) {
  return reviewOutputSchema.safeParse(data);
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: FAIL — consumers of the old exported types (`reviewOutputBlogVideoSchema`, `reviewOutputPublicationSchema`, etc.) break.

- [ ] **Step 3: Fix broken imports**

For each file that imports a removed export, grep:

```
validateReviewOutputBlogVideo|validateReviewOutputPublication|reviewOutputPublicationSchema|ReviewOutputBlogVideo|ReviewOutputPublication
```

Rewrite each call site to use `validateReviewOutput` and the new `ReviewOutput` type. If the call site's logic depends on stage-specific shapes that no longer exist, replace that logic with `output.{type}_review?.quality_tier` reads.

- [ ] **Step 4: Run typecheck + tests**

Run: `npm run typecheck && npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/review.ts apps/**/*.ts
git commit -m "$(cat <<'EOF'
refactor(schemas): align reviewOutputSchema with new agent contract

Removes stale blog/video/publication-stage discriminator. New schema
matches BC_REVIEW_OUTPUT with per-content-type review blocks and
quality_tier enum.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Create `reviewTierCompat` dual-read helper

**Files:**
- Create: `packages/shared/src/utils/reviewTierCompat.ts`
- Create: `packages/shared/src/utils/__tests__/reviewTierCompat.test.ts`

- [ ] **Step 1: Write the failing test first**

```typescript
// packages/shared/src/utils/__tests__/reviewTierCompat.test.ts
import { describe, it, expect } from 'vitest';
import { deriveTier, isApprovedTier } from '../reviewTierCompat';

describe('deriveTier', () => {
  it('returns tier from new-shape review', () => {
    expect(deriveTier({ quality_tier: 'excellent' })).toBe('excellent');
    expect(deriveTier({ quality_tier: 'needs_revision' })).toBe('needs_revision');
  });

  it('maps legacy numeric score to tier (dual-read)', () => {
    expect(deriveTier({ score: 95 })).toBe('excellent');
    expect(deriveTier({ score: 85 })).toBe('good');
    expect(deriveTier({ score: 60 })).toBe('needs_revision');
    expect(deriveTier({ score: 20 })).toBe('reject');
  });

  it('returns not_requested on null/undefined', () => {
    expect(deriveTier(null)).toBe('not_requested');
    expect(deriveTier(undefined)).toBe('not_requested');
    expect(deriveTier({})).toBe('not_requested');
  });
});

describe('isApprovedTier', () => {
  it('approves excellent and good only', () => {
    expect(isApprovedTier('excellent')).toBe(true);
    expect(isApprovedTier('good')).toBe(true);
    expect(isApprovedTier('needs_revision')).toBe(false);
    expect(isApprovedTier('reject')).toBe(false);
    expect(isApprovedTier('not_requested')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

Run: `npx vitest run packages/shared/src/utils/__tests__/reviewTierCompat.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```typescript
// packages/shared/src/utils/reviewTierCompat.ts
import type { QualityTier } from '../schemas/review';

export function deriveTier(review: unknown): QualityTier {
  if (!review || typeof review !== 'object') return 'not_requested';
  const r = review as Record<string, unknown>;

  if (typeof r.quality_tier === 'string') {
    const t = r.quality_tier as QualityTier;
    if (['excellent', 'good', 'needs_revision', 'reject', 'not_requested'].includes(t)) {
      return t;
    }
  }

  if (typeof r.score === 'number') {
    const s = r.score;
    if (s >= 90) return 'excellent';
    if (s >= 75) return 'good';
    if (s >= 50) return 'needs_revision';
    return 'reject';
  }

  return 'not_requested';
}

export function isApprovedTier(tier: QualityTier): boolean {
  return tier === 'excellent' || tier === 'good';
}
```

- [ ] **Step 4: Run test — expect pass**

Run: `npx vitest run packages/shared/src/utils/__tests__/reviewTierCompat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/utils/reviewTierCompat.ts packages/shared/src/utils/__tests__/reviewTierCompat.test.ts
git commit -m "$(cat <<'EOF'
feat(shared): reviewTierCompat for dual-read legacy + new reviews

Unified deriveTier() reads new quality_tier or maps legacy numeric score.
30-day compatibility window for existing content_drafts.review_feedback_json.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Update ReviewEngine to use `quality_tier` + dual-read

**Files:**
- Modify: `apps/app/src/components/engines/ReviewEngine.tsx` (lines ~155-280 — verdict normalization block)

- [ ] **Step 1: Replace `score >= 90` threshold logic**

At `apps/app/src/components/engines/ReviewEngine.tsx:254-258`:

```typescript
// Normalize verdict — score ≥ 90 always means approved
if (score >= 90) verdict = 'approved';
else if (verdict.includes('approved')) verdict = 'approved';
else if (verdict.includes('rejected')) verdict = 'rejected';
else verdict = 'revision_required';
```

Replace with:

```typescript
import { deriveTier, isApprovedTier } from '@brighttale/shared/utils/reviewTierCompat';

// ... inside the handler ...

const tier = deriveTier(feedbackJson);
if (isApprovedTier(tier)) {
  verdict = 'approved';
} else if (tier === 'reject') {
  verdict = 'rejected';
} else {
  verdict = 'revision_required';
}
```

- [ ] **Step 2: Update other `score` reads in the file**

For every read of `.score` that's still a number (lines 155, 192, 236, 240, 250), convert to tier-based logic:
- Lines 155/192: when displaying score in the UI, render `deriveTier(review)` as a badge label instead.
- Lines 240-250: use `deriveTier` to normalize.

- [ ] **Step 3: Update UI to render tier badge + issue lists**

In the render section, replace any `<Badge>{score}/100</Badge>` with:

```tsx
<Badge variant={isApprovedTier(tier) ? 'default' : 'destructive'}>
  {tier.replace(/_/g, ' ')}
</Badge>
{rubric?.critical_issues?.length > 0 && (
  <ul className="list-disc pl-5 text-sm text-destructive">
    {rubric.critical_issues.map((i: string, idx: number) => (
      <li key={idx}>{i}</li>
    ))}
  </ul>
)}
```

- [ ] **Step 4: Keep `reviewScore` in the DB write for backward compatibility**

Current behavior writes `reviewScore` and `reviewVerdict`. Keep both for the compatibility window. If the incoming review has no numeric score, derive one from tier for legacy consumers:

```typescript
const legacyScoreFromTier: Record<string, number> = {
  excellent: 95, good: 82, needs_revision: 60, reject: 20, not_requested: 0,
};
const scoreForDb = typeof feedbackJson.score === 'number'
  ? feedbackJson.score
  : legacyScoreFromTier[tier] ?? 0;
```

This ensures existing dashboards reading `review_score` keep working.

- [ ] **Step 5: Typecheck + smoke test in browser**

Run: `npm run typecheck`
Expected: PASS.

Then start dev server (`npm run dev`) and manually run a review through the UI — confirm the tier badge renders and the approve/reject path still works.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/components/engines/ReviewEngine.tsx
git commit -m "$(cat <<'EOF'
feat(review): ReviewEngine reads quality_tier with legacy score fallback

Tier badge replaces numeric score display. Approval threshold uses
isApprovedTier(). Legacy reviews with numeric score continue to resolve
via deriveTier for 30 days.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Verify PipelineOrchestrator doesn't read raw score

**Files:**
- Read: `apps/app/src/components/pipeline/PipelineOrchestrator.tsx`

- [ ] **Step 1: Grep for score reads**

```
Grep pattern: review_score|reviewScore|\.score
Path: apps/app/src/components/pipeline/
```

- [ ] **Step 2: If any exist, convert to tier-based**

Any numeric comparison (`score >= 90`) should become `isApprovedTier(deriveTier(review))`.

If no matches: orchestrator is already tier-agnostic (uses `reviewVerdict` string). No change needed — document in a one-line comment that tier compatibility is handled in ReviewEngine.

- [ ] **Step 3: Commit (if changed)**

```bash
git add apps/app/src/components/pipeline/PipelineOrchestrator.tsx
git commit -m "refactor(pipeline): orchestrator reads tier via verdict, not score

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 19: Compress Review customSections (partial — stacks with Plan B Theme 4d)

**Files:**
- Modify: `scripts/agents/review.ts` (customSections array)

Note: this task does the Theme 2b compression from the spec. Theme 4d (Plan B) will do the final compression pass. Target here: 528 lines → ~400 lines.

- [ ] **Step 1: Identify the 5 per-content-type review customSections**

Grep: `title: 'Blog Review'` (and similar) in `scripts/agents/review.ts`. There are ~5 sections, one per content type.

- [ ] **Step 2: For each section, apply these edits**

- Reduce example JSON blocks from 2-3 to 1 per section.
- Replace prose paragraphs with rubric bullets.
- Remove any line that mentions numeric scoring (replace with tier derivation).

Specific example — if a section currently shows:

```
Example of a good blog review:
{
  "verdict": "approved",
  "score": 92,
  "strengths": ["clear thesis", "strong hook"],
  ...
}
```

Replace with:

```
Example (excellent tier, 0 critical + 1 minor):
{
  "quality_tier": "excellent",
  "rubric_checks": {
    "critical_issues": [],
    "minor_issues": ["Meta description is 158 chars — consider 155 for safety"],
    "strengths": ["Clear thesis", "Strong hook", "SEO slug is valid"]
  }
}
```

- [ ] **Step 3: Verify line count**

Run: `wc -l scripts/agents/review.ts`
Target: between 400 and 450 lines (down from 528).

- [ ] **Step 4: Commit**

```bash
git add scripts/agents/review.ts
git commit -m "$(cat <<'EOF'
refactor(agents): compress review customSections (theme 2b)

Per-content-type examples trimmed from 2-3 to 1, prose → rubric bullets,
all score references updated to quality_tier. Theme 4d (Plan B) will do
the final compression pass.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: Regenerate seed.sql and verify

**Files:**
- Run: `npm run db:seed` (regenerates `supabase/seed.sql` via `scripts/generate-seed.ts`)

- [ ] **Step 1: Run seed regenerator**

Run: `npm run db:seed`
Expected: `supabase/seed.sql` is updated. The command may also reset local DB — if local Supabase is running, changes apply immediately.

- [ ] **Step 2: Diff the generated seed**

Run: `git diff supabase/seed.sql | head -200`
Expected: changes reflect the new brainstorm monetization_hypothesis block, podcast host_talking_prompts, review quality_tier/rubric_checks, expanded review inputSchema.

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "chore(db): regenerate agent prompt seed after Plan A changes

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 21: Full test sweep + build

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Tests**

Run: `npm run test`
Expected: all PASS, including the new `agentContracts.test.ts` and `reviewTierCompat.test.ts`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`
Open http://localhost:3000 → trigger a brainstorm → confirm `monetization_hypothesis` labels show "AI speculation" warning.
Run a pipeline through review → confirm quality_tier badge renders, approval gate works with tier-based threshold.

If any manual check fails: do NOT mark the task complete. Return to the relevant task and fix before proceeding.

---

## Task 22: Prepare Plan A handoff and launch Plan B

- [ ] **Step 1: Re-run the 13-criterion audit mentally against updated agents**

Open `docs/agent-prompt-audit-post-improvement.md`. For each agent, estimate which criteria moved. Expected movement from Plan A:
- Review: +1.2 (criteria 4, 5, 6, 7, 9, 10, 13 all lift)
- Brainstorm: +0.1-0.2 (criterion 13 lift from rename)
- Podcast: +0.3 (criteria 6, 13 lift)
- Blog/Video/Shorts/Engagement: +0.2 each (criterion 4 lift via expanded Review schema)

Document any surprises in a short markdown file: `docs/agent-prompt-audit-post-plan-a.md`.

- [ ] **Step 2: Write Plan B (Themes 3, 4, 5)**

This is a separate planning exercise — invoke the writing-plans skill again with the spec + Plan A outcomes as context.

- [ ] **Step 3: Final commit + PR**

```bash
git log --oneline -20
```

Expected: ~18 commits landed for Plan A. Create PR only when user requests.

---

## Self-Review

**Spec coverage:**
- Theme 6 (renames) — Tasks 2-6 ✓
- Theme 1 (Review inputSchema) — Tasks 7-11 ✓
- Theme 2a (score → tier) — Tasks 12-13 ✓
- Theme 2b (compression) — Task 19 (partial; Plan B Theme 4d finishes)
- Theme 2c (malformed guardrails) — Task 14 ✓
- Orchestrator threshold update — Tasks 17-18 ✓
- Zod schema alignment — Task 15 ✓
- Dual-read compat — Task 16 ✓
- Seed regen — Task 20 ✓

**Placeholder scan:** all tasks have concrete code. No TBD, no "similar to Task N". Import paths for the agentContracts test have a noted fallback strategy.

**Type consistency:** `QualityTier`, `RubricChecks` defined in Task 15, consumed in Tasks 16-17. Field names consistent: `quality_tier`, `rubric_checks`, `critical_issues`, `minor_issues`, `strengths`.

**Known gaps (acceptable):**
- Task 19 is a partial compression; Plan B completes it. Intentional — keeps Plan A reviewable.
- Task 18 is a verification-only task; may become a no-op if orchestrator already tier-agnostic.

**Risks:**
- Task 11's cross-monorepo import of agent seed may need a shim; task documents the fallback.
- Task 17 touches a 650-line file — fresh eyes on the final diff matter. If reviewing subagent reports "touched more than expected", push back.
