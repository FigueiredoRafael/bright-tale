# Agent Prompt Improvements Design

**Date:** 2026-04-21
**Based on:** `docs/agent-prompt-audit.md` (13-criterion audit of all 9 agents)
**Scope:** All 12 audit recommendations (P0 + P1 + P2)

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Execution strategy | Batch by issue category (4 phases) | Each phase independently verifiable via `npm run db:seed` |
| Review schema expansion | Selective fields only | Enough for meaningful review without bloating token budget |
| Portuguese sections | Translate + compress + merge | Eliminates language contamination, reduces token count ~40-50% |
| Redundancy strategy | Single source of truth in `STANDARD_JSON_RULES` | Remove all duplicates from `rules.formatting` and "Before Finishing" |
| Hallucination fields | Aggressive removal | Remove fields with zero grounding, strict constraints on the rest |

---

## Phase 1: Foundation — Dedup + Escape Reminders

**Goal:** Single source of truth for formatting rules in `STANDARD_JSON_RULES`.

### `_helpers.ts`

Already updated (uncommitted). Contains 5 rules:
1. Valid JSON / JSON.parse()
2. No em-dashes
3. No curly quotes
4. Literal newlines in strings
5. Escape double quotes

No further changes needed.

### All 9 agent files

For each agent, remove from `rules.formatting[]` and "Before Finishing" custom section any rule that duplicates `STANDARD_JSON_RULES`:

| Duplicate rule | Remove from |
|----------------|-------------|
| "No em-dashes (--), use regular dashes (-)" | `rules.formatting` + "Before Finishing" |
| "No curly quotes, use straight quotes only" | `rules.formatting` + "Before Finishing" |
| "Output JSON only, no markdown fences" | `rules.formatting` (keep first occurrence only if not in STANDARD) |
| "YAML pipe" / "Use literal newlines" | `rules.formatting` + "Before Finishing" |
| "Escape all double quotes" | "Before Finishing" (Blog item #12) |

**Keep in `rules.formatting`:** Agent-specific rules (e.g., Blog's "For multi-line string values, embed literal newline characters").

**Keep in "Before Finishing":** Verification steps that reference output fields (e.g., "Verify slug is URL-safe") — these are checklist items, not formatting rules.

### Files touched
- `scripts/agents/brainstorm.ts`
- `scripts/agents/research.ts`
- `scripts/agents/content-core.ts`
- `scripts/agents/blog.ts`
- `scripts/agents/video.ts`
- `scripts/agents/shorts.ts`
- `scripts/agents/podcast.ts`
- `scripts/agents/engagement.ts`
- `scripts/agents/review.ts`

### Verification
- `npm run db:seed` succeeds
- Grep for "em-dash" / "curly quotes" in `rules.formatting` arrays returns 0 hits

---

## Phase 2: Language + Compression — Portuguese Translation & Merge

**Goal:** Zero Portuguese in any agent prompt. Compressed content merged into existing sections.

### Blog (`blog.ts`)

**"Target Length (F2-047)"** — delete standalone section. Merge translated + compressed content (~3 rules) into existing "Field Guidance: Full Draft" custom section:

- If `production_params.target_word_count` present, `full_draft` must hit that count (+-15%)
- Scale structure: 300w = 1 idea + practical take, 500-700w = 2-3 sub-points with examples, 1000+w = long-form with sub-headings and case studies
- If research insufficient for target, return `content_warning` instead of padding (field added in Phase 3)

### Video (`video.ts`)

**"Dual Output Requirement (F2-045)"** — delete standalone section. Compress core concepts into `rules.content`:

- `teleprompter_script`: presenter-facing, natural speech, pause/emphasis markers
- `editor_script`: editor-facing, scene-by-scene with b-roll/overlay/music cues
- Both derive from same `argument_chain`, different consumers

**"Complete YouTube Package (F2-046)"** — delete standalone section. Compress YouTube metadata rules into a single compact "YouTube Metadata" paragraph in `rules.content`:

- `video_title`, `video_description`, `thumbnail`, `pinned_comment` are mandatory
- Description: timestamps, keywords, CTAs
- No emoji rules or language-specific phrasing (handled by channel context at runtime)

**"Target Duration (F2-047)"** — delete standalone section. Merge into `rules.content`:

- If `production_params.target_duration` present, script length must target that duration (+-15%)
- Calculate from ~150 words/minute speaking rate
- If material insufficient, return `content_warning`

### Podcast (`podcast.ts`) + Shorts (`shorts.ts`)

Each has "Target Duration (F2-047)". Check language — if Portuguese, same treatment: translate, compress, merge into `rules.content`. If already English, just compress and merge.

### Files touched
- `scripts/agents/blog.ts`
- `scripts/agents/video.ts`
- `scripts/agents/podcast.ts`
- `scripts/agents/shorts.ts`

### Verification
- Grep for Portuguese words (`conteudo`, `deve`, `palavras`, `campo`) returns 0 hits across all agent files
- `npm run db:seed` succeeds

---

## Phase 3: Hallucination Cleanup — Remove/Constrain Fabrication Fields

**Goal:** Remove fields with zero grounding. Add constraints to partially-groundable fields.

### Remove entirely

| Agent | Field | Action |
|-------|-------|--------|
| Brainstorm | `primary_keyword.monthly_volume_estimate` | Remove from `outputSchema.fields`. Remove references in rules/guidance. |
| Review | `publication_plan.*.recommended_publish_date` | Remove from outputSchema |
| Review | `publication_plan.*.publish_time` | Remove from outputSchema |
| Review | `publication_plan.blog.internal_links[].target_url` | Remove from outputSchema |
| Blog | `word_count` (output) | Remove from outputSchema. Keep `word_count_target` in outline entries. |

### Add strict constraints

| Agent | Field | Constraint added to `rules.validation` |
|-------|-------|----------------------------------------|
| Research | `sources[].url` | "If you cannot verify a URL exists, set to empty string. Never fabricate URLs." |
| Research | `confidence_score` | Calibration rubric: 1-3 = weak/unverifiable, 4-6 = moderate/partial evidence, 7-9 = strong/multiple sources, 10 = conclusive/peer-reviewed |
| Research | `statistics[].figure` + `expert_quotes[].quote` | "Only include statistics and quotes found in sources. If paraphrasing, mark with '[paraphrased]'. Never fabricate quotes attributed to real people." |
| Video | `total_duration_estimate` | Rename to `estimated_duration`. Add: "Calculate from script word count at ~150 words/minute. State as estimate." |
| Blog | `internal_links_suggested` | "These are topic suggestions for the content team, not real URLs. Do not include URLs." |

### Mark as estimates (description updates)

| Agent | Field | New description |
|-------|-------|-----------------|
| Podcast | `personal_angle` | "First-person framing for the host to personalize. The host will adapt with their real experience." |
| Podcast | `duration_estimate` | "Rough estimate based on talking point count. Not a production target." |

### Cross-cutting additions

**Content Core (`content-core.ts`):**
- Add `argument_chain` max: "Min 2 steps, max 6 steps. If research supports more than 6 claims, consolidate related steps."
- Add to both field description and `rules.validation`.

**Engagement (`engagement.ts`):**
- Add fallback rule to `rules.content`: "If `key_stats` is empty or not provided, use qualitative claims from `argument_chain` evidence instead. Do not fabricate statistics."

**Blog (`blog.ts`):**
- Add `content_warning` to output schema: `str('content_warning', 'Set if research material is insufficient for the target word count', false)`

### Files touched
- `scripts/agents/brainstorm.ts`
- `scripts/agents/research.ts`
- `scripts/agents/content-core.ts`
- `scripts/agents/blog.ts`
- `scripts/agents/video.ts`
- `scripts/agents/podcast.ts`
- `scripts/agents/engagement.ts`
- `scripts/agents/review.ts`

### Verification
- Grep for `monthly_volume_estimate` returns 0 hits
- Grep for `recommended_publish_date` / `publish_time` / `target_url` in review.ts returns 0 hits
- Grep for `word_count` in blog.ts outputSchema returns 0 hits (but `word_count_target` in outline stays)
- `npm run db:seed` succeeds

---

## Phase 4: Review Schema Expansion — Selective Field Additions

**Goal:** Give Review agent enough input fields to meaningfully assess each content type.

### Review `inputSchema.production` changes

| Content Type | Current Fields | Add | Skip (intentionally) |
|---|---|---|---|
| **blog** | title, meta_description, full_draft, word_count | `slug` (string), `primary_keyword` (string) | outline, secondary_keywords, affiliate_integration |
| **video** | title_options, script (empty obj), total_duration_estimate | `thumbnail` (object: text, emotion, visual_style), `chapter_count` (number) | full teleprompter/editor scripts, video_description |
| **shorts** | array of strings | **Change type** to `arrOf` with: `hook` (string), `script` (string), `visual_style` (string), `duration_target` (string) | sound_effects, background_music |
| **podcast** | episode_title, talking_points | `intro_hook` (string), `outro` (string) | personal_angle, guest_questions, duration_estimate |
| **engagement** | pinned_comment, community_post | `hook_tweet` (string), `thread_outline` (array of strings) | (now receives all 4 output fields) |

### Review custom sections updates

Update any Review custom section that describes "what you receive" to reflect the new fields. Specifically:
- Blog review guidance: mention slug URL-safety check, primary_keyword presence in title/meta/draft
- Shorts review guidance: reference hook quality, visual_style consistency across 3 shorts
- Engagement review guidance: mention tweet/thread assessment

### Note on word_count removal

Blog `word_count` was removed in Phase 3. Update Review's blog input to also remove `word_count` (number field).

### Files touched
- `scripts/agents/review.ts`

### Verification
- Review inputSchema blog has: title, meta_description, full_draft, slug, primary_keyword (no word_count)
- Review inputSchema shorts is `arrOf` not `arr`
- Review inputSchema engagement has 4 fields
- `npm run db:seed` succeeds

---

## Execution Order

```
Phase 1 (Foundation)     → npm run db:seed → verify
Phase 2 (Language)       → npm run db:seed → verify
Phase 3 (Hallucination)  → npm run db:seed → verify
Phase 4 (Review Schema)  → npm run db:seed → verify
```

Each phase is independently committable. If any phase breaks seed generation, it can be debugged in isolation.

## Out of Scope

- Shared TypeScript types in `packages/shared/src/types/agents.ts` — the mapper functions and types may need updates to match schema changes, but those are implementation details for the plan, not design decisions.
- Runtime prompt builder changes — the seed scripts are the source of truth; the prompt builder reads from DB.
- Re-scoring the audit — a follow-up audit can be run after implementation to measure improvement.
