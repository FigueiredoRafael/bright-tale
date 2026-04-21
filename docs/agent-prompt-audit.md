# Agent Prompt Audit Report

**Date:** 2026-04-21
**Auditor:** Claude (automated analysis)
**Scope:** All 9 agent seed definitions in `scripts/agents/`

---

## Scoring Criteria

| # | Criterion | Description |
|---|-----------|-------------|
| 1 | **Contract Completeness** | Every output field has a clear instruction. No orphan fields the AI must guess about. |
| 2 | **Input-Output Traceability** | Every input field is referenced in rules/guidance. Nothing accepted then ignored. |
| 3 | **JSON Safety** | Escaping, encoding, forbidden characters. Parse-failure surface area. |
| 4 | **Handoff Fidelity** | What the next agent expects matches what this agent outputs. No schema drift. |
| 5 | **Ambiguity** | Conflicting instructions, vague terms like "if applicable" without defining when. |
| 6 | **Failure Guardrails** | What happens when the AI can't fulfill a field? Fallback instructions or hallucinate? |
| 7 | **Token Budget** | Are instructions concise or bloated with redundant examples? |
| 8 | **Language Consistency** | Mixed languages in instructions (e.g., Portuguese in English prompts). |
| 9 | **Idempotency** | Same input produces structurally identical output. No instructions inviting randomness. |
| 10 | **Validation Checkability** | Can the output be programmatically validated against the rules? |
| 11 | **Redundancy** | Same instruction repeated across multiple sections, wasting tokens and creating drift risk. |
| 12 | **Alignment to Objective** | Does every instruction serve this agent's actual job? No leaked instructions from other stages. |
| 13 | **Hallucination Surface** | Fields where AI is likely to fabricate (URLs, stats, word counts, confidence scores). |

**Scale:** 0 = critically broken, 5 = functional but needs work, 10 = no issues found.

---

## Score Matrix

| Agent | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | **AVG** |
|-------|---|---|---|---|---|---|---|---|---|----|----|----|----|---------|
| **Brainstorm** | 8 | 5 | 7 | 6 | 7 | 4 | 8 | 9 | 7 | 6 | 8 | 9 | 4 | **6.8** |
| **Research** | 8 | 8 | 7 | 7 | 7 | 7 | 8 | 10 | 8 | 7 | 6 | 7 | 3 | **7.2** |
| **Content Core** | 9 | 8 | 7 | 7 | 7 | 8 | 7 | 10 | 8 | 8 | 6 | 9 | 7 | **7.8** |
| **Blog** | 9 | 8 | 8 | 6 | 6 | 6 | 5 | 4 | 7 | 7 | 4 | 8 | 5 | **6.4** |
| **Video** | 8 | 7 | 7 | 5 | 6 | 7 | 3 | 2 | 6 | 6 | 4 | 7 | 5 | **5.6** |
| **Shorts** | 9 | 8 | 7 | 5 | 7 | 7 | 6 | 10 | 8 | 8 | 5 | 9 | 7 | **7.4** |
| **Podcast** | 8 | 7 | 7 | 5 | 7 | 7 | 6 | 10 | 7 | 6 | 5 | 9 | 6 | **6.9** |
| **Engagement** | 9 | 8 | 7 | 5 | 7 | 6 | 6 | 10 | 8 | 8 | 5 | 9 | 7 | **7.2** |
| **Review** | 8 | 7 | 7 | 4 | 6 | 5 | 3 | 10 | 6 | 7 | 5 | 8 | 5 | **6.2** |

---

## Detailed Findings Per Agent

---

### 1. Brainstorm Agent

**Average: 6.8**

| Criterion | Score | Finding |
|-----------|-------|---------|
| Contract Completeness | 8 | All output fields documented. `inputSchema.fields` is empty (input comes from user message), which is intentional but undocumented. |
| Input-Output Traceability | 5 | No formal input schema means the agent infers everything from user message. No guidance on what happens if user provides partial context. |
| JSON Safety | 7 | Inherits `STANDARD_JSON_RULES` + escape rule. Good. |
| Handoff Fidelity | 6 | Output feeds Research input, but brainstorm output has `monetization.product_fit` and `monetization.sponsor_appeal` that Research input doesn't accept. Research only takes `affiliate_angle`. Data loss at handoff. |
| Ambiguity | 7 | "Generate exactly the number of ideas requested in the user message" - what if user doesn't specify a number? No default. |
| Failure Guardrails | 4 | No guidance for: what if the topic is too niche for monetization? What if no keyword data is available? AI will fabricate `monthly_volume_estimate`. |
| Token Budget | 8 | Concise. Field guidance section is well-structured. |
| Language Consistency | 9 | All English. |
| Idempotency | 7 | "Generate ideas" inherently varies, but structural output is consistent. |
| Validation Checkability | 6 | `verdict` enum is checkable. `monthly_volume_estimate` is not verifiable. |
| Redundancy | 8 | Minimal redundancy. |
| Alignment | 9 | All instructions serve brainstorming purpose. |
| Hallucination Surface | **4** | **Critical.** `primary_keyword.monthly_volume_estimate` - AI has no access to search volume data. Will always fabricate. `monetization` fields (affiliate_angle, product_fit, sponsor_appeal) - AI invents plausible-sounding brand names without verification. |

**Top Issues:**
1. `monthly_volume_estimate` is guaranteed hallucination - AI cannot access real search data
2. Handoff loses `product_fit` and `sponsor_appeal` (Research doesn't accept them)
3. No default idea count when user doesn't specify

---

### 2. Research Agent

**Average: 7.2**

| Criterion | Score | Finding |
|-----------|-------|---------|
| Contract Completeness | 8 | All fields documented. `seo` block newly added. `confidence_score` description says "1-10" but no guidance on what each score means. |
| Input-Output Traceability | 8 | Input fields well-referenced in rules. `depth` field drives source count requirement. |
| JSON Safety | 7 | Inherits standard rules + escape. |
| Handoff Fidelity | 7 | Handoff section updated with `seo`. `sources` output has `quote_excerpt` and `date_published` that get dropped in handoff (mapper only passes title, url, key_insight). Acceptable data reduction. |
| Ambiguity | 7 | `evidence_strength` values listed ("weak, moderate, strong") but `confidence_score` is "1-10 scale" with no calibration guidance. |
| Failure Guardrails | 7 | Good: "If core claims cannot be verified, set core_claim_verified to false." But no guidance for: what if no sources are findable? What if URL is not available? |
| Token Budget | 8 | Lean prompt. No excessive examples. |
| Language Consistency | 10 | All English. |
| Idempotency | 8 | Research output will vary by nature, but structure is consistent. |
| Validation Checkability | 7 | Enums are checkable. Source count is checkable. `confidence_score` range is checkable. |
| Redundancy | 6 | `purpose` section repeats almost verbatim in `rules.content`. 6 lines of duplicate instructions. |
| Alignment | 7 | Content rules repeat purpose statements. Minor misalignment - "request clarification" instruction is impossible in a single-turn JSON-only agent. |
| Hallucination Surface | **3** | **Critical.** `sources[].url` - AI will fabricate plausible-looking URLs that return 404. `statistics[].figure` - AI may invent specific percentages. `expert_quotes[].quote` - AI may fabricate quotes attributed to real people. `confidence_score` - no grounding methodology; number is arbitrary. |

**Top Issues:**
1. URLs are the #1 hallucination risk - AI cannot verify links exist
2. Statistics and quotes may be fabricated and attributed to real sources
3. `confidence_score` has no calibration - meaningless number
4. "Request clarification" instruction impossible in single-turn JSON output mode

---

### 3. Content Core Agent

**Average: 7.8** (Highest)

| Criterion | Score | Finding |
|-----------|-------|---------|
| Contract Completeness | 9 | Every field has detailed guidance in customSections. Thesis, argument_chain, emotional_arc all well-specified. |
| Input-Output Traceability | 8 | Input fields clearly map to output usage. `knowledge_gaps` input drives constraint on argument_chain. |
| JSON Safety | 7 | Standard rules. |
| Handoff Fidelity | 7 | Output feeds Blog/Video/Shorts/Podcast/Engagement. Input schemas of format agents match canonical core output well. Minor: `key_quotes` is optional in core but format agents may expect it. |
| Ambiguity | 7 | "Min 2 steps" for argument_chain but no max. Could get 20 steps, bloating downstream agents. |
| Failure Guardrails | 8 | Strong: "If recommendation is abandon, output only minimal object." "Do NOT invent statistics." "Do NOT make claims depending on knowledge_gaps." |
| Token Budget | 7 | Examples in customSections are useful but verbose. JSON examples could be trimmed. |
| Language Consistency | 10 | All English. |
| Idempotency | 8 | Same research input should produce consistent structural output. |
| Validation Checkability | 8 | `source_ids` cross-reference is checkable. Thesis length checkable. Step ordering checkable. |
| Redundancy | 6 | "Before Finishing" repeats rules from formatting section (em-dashes, curly quotes, YAML pipe). 4 redundant lines. |
| Alignment | 9 | All instructions serve the canonical core purpose. Clear scope boundaries. |
| Hallucination Surface | 7 | Well-guarded: "Only stats from research.key_statistics. Do not fabricate figures." "Only quotes from research.expert_quotes." Main risk: `cta_subscribe` and `cta_comment_prompt` are generated without grounding. |

**Top Issues:**
1. No max argument_chain steps - could produce bloated output
2. Redundant formatting rules in "Before Finishing"

---

### 4. Blog Agent

**Average: 6.4**

| Criterion | Score | Finding |
|-----------|-------|---------|
| Contract Completeness | 9 | Every field has dedicated guidance section. `full_draft` has detailed structure guidance. |
| Input-Output Traceability | 8 | Input fields well-mapped. `affiliate_context` input maps to `affiliate_integration` output. |
| JSON Safety | 8 | Standard rules + explicit double-quote escaping rule (item #12). Best JSON safety of all agents. |
| Handoff Fidelity | 6 | Blog output feeds Review input, but Review's `production.blog` schema is sparse (only title, meta_description, full_draft, word_count). Blog outputs `slug`, `primary_keyword`, `secondary_keywords`, `outline`, `affiliate_integration`, `internal_links_suggested` - all lost at Review handoff. Review can't check SEO slug or keyword usage without receiving them. |
| Ambiguity | 6 | `full_draft` "in markdown" - but also "no markdown code fences." Which markdown features are allowed? H2 yes, code blocks no, what about tables, images, bold? |
| Failure Guardrails | 6 | Target Length section mentions `content_warning` field but it's not in the output schema. If material is insufficient, agent has no valid field to report it. |
| Token Budget | **5** | 7 customSections + "Before Finishing" = very long prompt. Title/Meta/Outline/Full Draft/Affiliate/Internal Links guidance sections are verbose. Could compress by ~40%. |
| Language Consistency | **4** | "Target Length (F2-047)" section is entirely in Portuguese. All other sections English. Mixed language in same prompt confuses the model about output language. |
| Idempotency | 7 | `full_draft` will vary in wording but structure should be consistent. |
| Validation Checkability | 7 | Slug format, meta_description length, word count - all programmatically checkable. |
| Redundancy | **4** | "No em-dashes" appears in: STANDARD_JSON_RULES, rules.formatting, and "Before Finishing" = 3x. "No curly quotes" = 3x. "No markdown code fences" = 2x. "YAML pipe" = 2x. ~12 redundant lines total. |
| Alignment | 8 | All instructions serve blog production. |
| Hallucination Surface | 5 | `word_count` - AI rarely counts accurately. `internal_links_suggested` - AI invents topic/anchor pairs without knowing what content exists on the site. `primary_keyword` in output has no grounding if canonical core didn't pass it. |

**Top Issues:**
1. **Portuguese section** in otherwise English prompt - language contamination risk
2. Heavy redundancy (12+ redundant lines across sections)
3. `content_warning` referenced in rules but missing from output schema
4. Handoff to Review loses most blog-specific fields (slug, keywords, outline)
5. `word_count` is unreliable - AI doesn't count words accurately

---

### 5. Video Agent

**Average: 5.6** (Lowest)

| Criterion | Score | Finding |
|-----------|-------|---------|
| Contract Completeness | 8 | Comprehensive field coverage. `editor_script` defined as `obj(..., {}, false)` with empty fields - schema gives no structure guidance (structure is only in Portuguese prose). |
| Input-Output Traceability | 7 | Input fields mapped. `video_style_config` options well-referenced in principles. |
| JSON Safety | 7 | Standard rules. No explicit double-quote escape (unlike Blog). `teleprompter_script` and `editor_script` are long multiline strings - high parse-failure risk. |
| Handoff Fidelity | **5** | Output feeds Review, but Review's `production.video` has empty `script` object (`obj('script', ..., [], false)`) - loses all chapter detail. `teleprompter_script`, `editor_script`, `video_title`, `thumbnail_ideas`, `pinned_comment`, `video_description` - all lost at handoff. Review agent can't meaningfully assess video quality. |
| Ambiguity | 6 | `editor_script` type is `obj(..., {})` (empty object) but prose says it can be "array of scenes OR structured markdown string." Two incompatible types for one field. |
| Failure Guardrails | 7 | Good: `content_warning` for insufficient material. But `content_warning` is in output schema (unlike Blog). |
| Token Budget | **3** | **Longest prompt of all agents.** F2-045 (Dual Output) = ~2500 chars of Portuguese prose with code examples. F2-046 (YouTube Package) = ~2800 chars of Portuguese prose. F2-047 (Target Duration) = ~800 chars Portuguese. Total Portuguese sections: ~6100 chars. Plus 13 "Before Finishing" items. Massive token consumption. |
| Language Consistency | **2** | **Three full sections in Portuguese** (F2-045, F2-046, F2-047) embedded in an otherwise English prompt. ~40% of customSections content is Portuguese. This actively confuses the model about what language to output in, especially when Channel Context says "English." |
| Idempotency | 6 | `title_options` requires "exactly 3" but content varies. `editor_script` has no structural contract, so format will differ wildly between runs. |
| Validation Checkability | 6 | title_options count, thumbnail.emotion enum, chapter count - all checkable. But `teleprompter_script` length (1500 chars min) and `video_description` length (800 chars) require character counting that AI does poorly. |
| Redundancy | **4** | "No em-dashes" = 3x (STANDARD_JSON_RULES + rules.formatting + Before Finishing). "No curly quotes" = 3x. Sound/music requirements stated in principles AND rules.content AND chapter guidance. F2-045 restates rules that are already in the base prompt. ~15+ redundant lines. |
| Alignment | 7 | Mostly aligned. F2-046 includes specific Portuguese instructions about emoji usage and phrasing that may conflict with channel-level language settings. |
| Hallucination Surface | 5 | `sound_effects` and `background_music` for every section - AI invents generic music descriptions. `b_roll_suggestions` - AI invents shot descriptions without knowing available footage. `total_duration_estimate` - rough guess. `video_description` timestamps won't match actual video. |

**Top Issues:**
1. **40% of prompt in Portuguese** - severe language contamination
2. **Heaviest prompt** - token budget issue for models with smaller context
3. `editor_script` has no typed schema (empty object) - output structure unpredictable
4. Handoff to Review loses almost everything except title_options and duration
5. Duplicate instructions across F2-045/046/047 and base rules

---

### 6. Shorts Agent

**Average: 7.4**

| Criterion | Score | Finding |
|-----------|-------|---------|
| Contract Completeness | 9 | Clean, focused schema. Every field well-documented. |
| Input-Output Traceability | 8 | `turning_point` maps to Short #1 hook. `argument_chain` maps to #2 and #3. Clear chain. |
| JSON Safety | 7 | Standard rules. |
| Handoff Fidelity | 5 | Output feeds Review, but Review's `shorts` input is just `arr('shorts', ..., 'string', false)` - an array of strings, not objects. Entire shorts structure (hook, script, visual_style, duration, etc.) lost at handoff. Review agent receives string representations at best. |
| Ambiguity | 7 | `visual_style` enum is clear. "Pick the 2 most compelling" argument_chain steps - subjective but acceptable. |
| Failure Guardrails | 7 | Target Duration section mentions `content_warning` for insufficient material. |
| Token Budget | 6 | 7 customSections is moderate. Hook/Script/Visual Style guidance sections have good examples but could be shorter. |
| Language Consistency | 10 | All English. Clean. |
| Idempotency | 8 | "Exactly 3 shorts" with defined derivation rules. Structural consistency is high. |
| Validation Checkability | 8 | shorts count = 3, short_number sequence, visual_style enum, hook length - all checkable. |
| Redundancy | 5 | "Before Finishing" has 14 items, several repeating formatting rules. "No em-dashes" appears 3x. Visual_style enum described in principles, rules, guidance, and "Before Finishing" = 4x. |
| Alignment | 9 | Tightly focused on shorts production. No scope leakage. |
| Hallucination Surface | 7 | Low risk. Stats constrained to `key_stats` input. Duration estimates are rough but acceptable. `sound_effects` and `background_music` are suggestions, not facts. |

**Top Issues:**
1. Handoff to Review loses all shorts structure (Review expects string array, not objects)
2. `visual_style` described 4x across different sections

---

### 7. Podcast Agent

**Average: 6.9**

| Criterion | Score | Finding |
|-----------|-------|---------|
| Contract Completeness | 8 | All fields documented. `guest_questions` guidance is thin ("3-5 questions, frame as interview prompts" but no examples). |
| Input-Output Traceability | 7 | Most input fields mapped. `key_stats` usage guidance is brief ("use sparingly, cite source context") - could be more specific about WHERE to embed them. |
| JSON Safety | 7 | Standard rules. `intro_hook` and `personal_angle` are long strings - parse risk. |
| Handoff Fidelity | 5 | Review's `production.podcast` only accepts `episode_title` and `talking_points` (as string array). Loses: `episode_description`, `intro_hook`, `personal_angle`, `guest_questions`, `outro`, `duration_estimate`. Review cannot assess podcast quality meaningfully. |
| Ambiguity | 7 | "personal_angle must be first-person and experiential" - but AI has no personal experience. It will fabricate a plausible personal story. This is by design but should be acknowledged. |
| Failure Guardrails | 7 | Target Duration section has `content_warning` fallback. |
| Token Budget | 6 | Moderate. Examples in Talking Points and Personal Angle sections are helpful. |
| Language Consistency | 10 | All English. |
| Idempotency | 7 | Structural consistency good. `personal_angle` content will vary. |
| Validation Checkability | 6 | Talking point count checkable. First-person check is tricky programmatically. CTA inclusion in outro is checkable. |
| Redundancy | 5 | "Before Finishing" repeats formatting rules. Outro requirements stated in principles, rules, guidance, AND "Before Finishing" = 4x. |
| Alignment | 9 | Well-scoped to podcast format. |
| Hallucination Surface | 6 | `personal_angle` is explicitly fictional/invented (AI has no personal experience). `guest_questions` are speculative. `duration_estimate` is a rough calculation. |

**Top Issues:**
1. Handoff to Review loses most podcast fields
2. `personal_angle` is inherently fabricated - AI has no personal experience
3. Outro requirements repeated 4x

---

### 8. Engagement Agent

**Average: 7.2**

| Criterion | Score | Finding |
|-----------|-------|---------|
| Contract Completeness | 9 | Clean 4-field output. Every field has dedicated guidance. |
| Input-Output Traceability | 8 | `comment_prompt_seed` -> `pinned_comment`. `closing_emotion` + `cta_subscribe` -> `community_post` closing. Clear. |
| JSON Safety | 7 | Standard rules. |
| Handoff Fidelity | 5 | Review's `production.engagement` only accepts `pinned_comment` and `community_post`. Loses `hook_tweet` and `thread_outline`. Review cannot assess Twitter/X thread quality. |
| Ambiguity | 7 | Clear enums and constraints. "4-6 tweets" is specific. |
| Failure Guardrails | 6 | No `content_warning` field. No guidance for what to do if `key_stats` is empty (no stats to use in thread). |
| Token Budget | 6 | Moderate. Twitter Thread guidance has long YAML-style examples that could be JSON instead. |
| Language Consistency | 10 | All English. |
| Idempotency | 8 | Constraints are specific enough for consistent structure. |
| Validation Checkability | 8 | pinned_comment length (500 chars), ends with `?`, thread_outline count (4-6), last item is CTA - all checkable. |
| Redundancy | 5 | "No fabricated stats" in principles AND rules.content. Formatting rules in STANDARD + rules.formatting + Before Finishing. |
| Alignment | 9 | Tightly scoped to engagement assets. |
| Hallucination Surface | 7 | Stats constrained to input. Content is opinion/engagement-focused, so fabrication risk is lower. |

**Top Issues:**
1. Handoff to Review loses Twitter/X thread entirely
2. No fallback if `key_stats` is empty

---

### 9. Review Agent

**Average: 6.2**

| Criterion | Score | Finding |
|-----------|-------|---------|
| Contract Completeness | 8 | Massive output schema with detailed guidance for every review type. |
| Input-Output Traceability | 7 | Input fields used in review logic. But `production` input sub-schemas are sparse (see Handoff issues from upstream agents). |
| JSON Safety | 7 | Standard rules. Very long output - high parse failure risk due to sheer size. |
| Handoff Fidelity | **4** | **Critical.** Review is the RECEIVER of broken handoffs from all production agents. It receives degraded inputs: Blog loses slug/keywords/outline. Video loses chapters/scripts/thumbnails. Shorts receives string array instead of objects. Podcast loses intro/outro/personal_angle. The Review agent is asked to assess quality of content it cannot fully see. |
| Ambiguity | 6 | `score` guidance uses ranges (90-100, 75-89, etc.) but no guidance on what happens between scores within a range. "Below 50: reject" but score and verdict are separate fields that could conflict. |
| Failure Guardrails | 5 | No guidance for: what if production asset is malformed JSON? What if a field is missing entirely? What if content_types_requested includes a type not in the production object? |
| Token Budget | **3** | **Second longest prompt.** 11 customSections with detailed examples for every content type review. Many examples include full JSON structures that are helpful but massive. Total prompt likely exceeds 8000 tokens rendered. |
| Language Consistency | 10 | All English. |
| Idempotency | 6 | Scoring is subjective. Same content could get 78 or 82 depending on run. No rubric granularity. |
| Validation Checkability | 7 | Verdict enum, score range, ready_to_publish logic - all checkable. But score consistency across runs is not. |
| Redundancy | 5 | `content_types_requested` handling explained in rules, Content Type Handling section, Overall Verdict guidance, AND Before Finishing = 4x. Formatting rules repeated 3x. |
| Alignment | 8 | Well-scoped to review purpose. Publication plan is appropriate. |
| Hallucination Surface | 5 | `score` is subjective with no grounding formula. `publication_plan` dates are fabricated (AI doesn't know the content calendar). `recommended_publish_date` and `publish_time` - AI invents plausible dates. `internal_links[].target_url` - AI fabricates URLs. |

**Top Issues:**
1. **Receives degraded input from all production agents** - cannot meaningfully review content it can't see
2. Largest output schema - high JSON parse failure risk
3. Scores are subjective with no grounding formula
4. Publication dates and URLs are fabricated

---

## Cross-Cutting Issues (Systemic)

### Issue A: Handoff Data Loss (Severity: HIGH)

The mapper functions between stages strip fields that downstream agents need:

| From | To | Fields Lost |
|------|----|-------------|
| Brainstorm | Research | `monetization.product_fit`, `monetization.sponsor_appeal` |
| Blog | Review | `slug`, `primary_keyword`, `secondary_keywords`, `outline`, `affiliate_integration`, `internal_links_suggested` |
| Video | Review | `chapters`, `teleprompter_script`, `editor_script`, `video_title`, `thumbnail_ideas`, `pinned_comment`, `video_description` |
| Shorts | Review | Entire object structure (Review expects string array) |
| Podcast | Review | `episode_description`, `intro_hook`, `personal_angle`, `guest_questions`, `outro`, `duration_estimate` |
| Engagement | Review | `hook_tweet`, `thread_outline` |

**Impact:** Review agent is asked to assess quality of content it receives in degraded form. It cannot check slugs, keyword usage, video pacing, or shorts hook quality because those fields never arrive.

### Issue B: Language Contamination (Severity: HIGH)

| Agent | Portuguese Content | Impact |
|-------|--------------------|--------|
| Blog | "Target Length (F2-047)" - entire section | Model may output Portuguese fragments in English content |
| Video | F2-045, F2-046, F2-047 - three full sections (~6100 chars) | ~40% of custom sections in Portuguese. High confusion risk. |

All other agents are clean English. The Portuguese sections appear to be feature additions (F2-045/046/047) that were written in Portuguese and never translated.

### Issue C: Guaranteed Hallucination Fields (Severity: MEDIUM)

Fields where AI output is **guaranteed** to be fabricated:

| Agent | Field | Why |
|-------|-------|-----|
| Brainstorm | `primary_keyword.monthly_volume_estimate` | AI has no access to search volume data |
| Research | `sources[].url` | AI fabricates plausible URLs |
| Research | `confidence_score` | No grounding methodology |
| Blog | `word_count` | AI can't count words accurately |
| Video | `total_duration_estimate` | Rough guess, not calculation |
| Review | `publication_plan.*.recommended_publish_date` | AI doesn't know content calendar |
| Review | `publication_plan.blog.internal_links[].target_url` | AI fabricates site URLs |
| Podcast | `personal_angle` | AI has no personal experience |

### Issue D: Redundancy Tax (Severity: MEDIUM)

Estimated redundant tokens across all agents:

| Rule | Times Repeated (avg per agent) | Recommendation |
|------|-------------------------------|----------------|
| "No em-dashes" | 3x | Keep only in STANDARD_JSON_RULES |
| "No curly quotes" | 3x | Keep only in STANDARD_JSON_RULES |
| "No markdown code fences" | 2x | Keep only in rules.formatting |
| "YAML pipe" | 2x | Keep only in STANDARD_JSON_RULES |
| "Output JSON only" | 2x | Keep only in rules.formatting |

Estimated wasted tokens per prompt: ~200-400 tokens. Across 9 agents: ~2000-3600 tokens of redundancy.

### Issue E: Missing Double-Quote Escape Rule (Severity: MEDIUM)

After today's fix, `STANDARD_JSON_RULES` includes the escape rule. But Blog is the only agent with an **explicit** reminder in "Before Finishing." All agents with long multiline strings should reinforce this:

| Agent | Long String Fields | Has Explicit Escape Reminder |
|-------|--------------------|------------------------------|
| Blog | `full_draft` | Yes (item #12) |
| Video | `teleprompter_script`, `editor_script`, `video_description` | No |
| Podcast | `intro_hook`, `personal_angle`, `outro` | No |
| Shorts | `script` (x3) | No |
| Engagement | `community_post`, `thread_outline` | No |

---

## Priority Recommendations

### P0 - Fix Now

1. **Translate Portuguese sections** in Blog (1 section) and Video (3 sections) to English
2. **Fix Review input schemas** to accept full production output (not degraded subsets)
3. **Add escape reminder** to "Before Finishing" in Video, Podcast, Shorts, Engagement agents

### P1 - Fix Soon

4. **Remove `monthly_volume_estimate`** from Brainstorm output (or mark as "estimate only, not real data")
5. **Add `content_warning` to Blog output schema** (referenced in rules but missing from schema)
6. **Define `editor_script` schema** in Video agent (currently empty object)
7. **Deduplicate formatting rules** - remove from rules.formatting and "Before Finishing" what's already in STANDARD_JSON_RULES

### P2 - Improve

8. **Add calibration guidance** for Research `confidence_score` (what does 3 vs 7 mean?)
9. **Add max argument_chain steps** to Content Core (suggest: max 6)
10. **Add URL disclaimer** to Research agent ("If URL cannot be verified, set to empty string")
11. **Add fallback for empty key_stats** in Engagement agent
12. **Reduce Review prompt size** - compress examples, remove redundant guidance
