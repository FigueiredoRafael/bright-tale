# Persona-Driven EEAT Layer — Design Spec
**Date:** 2026-04-22  
**Status:** Approved  
**Niche:** Early Stage Entrepreneurs aiming for Financial Independence and Early Retirement in the US  
**Target audience:** Young men, 25–35, early-stage entrepreneurs  

---

## Problem

The content audit (April 2026) identified a single root cause behind 65% of posts being marked KILL: the "Experience" gap in Google's EEAT framework. Posts read like research summaries — well-structured, factual, but written by nobody in particular. No consistent authorial voice, no worldview, no genuine perspective. Generic AI content has no identity. Identity is what EEAT rewards.

The peer review confirmed: the fix is not better research or better structure. It is adding a **consistent author identity that shapes how evidence is interpreted** — not fabricating first-person experiences.

---

## Solution

A **persona layer** injected into the existing 5-stage content pipeline. Three fictional-but-grounded author personas, each a distinct facet of the same real worldview, each with a complete identity schema covering six layers:

1. Identity (WordPress author profile)
2. Domain (what they cover + their lens)
3. Voice (how the Blog Agent writes)
4. EEAT signals (how the Content Core frames the angle)
5. Soul (values, opinions, humor, tensions)
6. Language guardrails (persona-specific AI vice blockers)

---

## Architecture — Approach B

Persona shapes **angle** (Content Core Agent) and **voice** (Blog Agent). No new pipeline stage.

```
UI (persona selector)
        ↓
Brainstorm → Research → Content Core* → Blog Agent* → Review → Assets → Publish
                              ↑                ↑
                     persona_context      full persona object
                  (domain_lens,         (writing_voice_json,
                   analytical_lens,      soul_json,
                   strong_opinions)      language_guardrails)
```

`*` = modified. Everything else unchanged.

**Why Approach B over alternatives:**
- Approach A (Blog Agent only) — persona shapes voice but not angle. Weaker EEAT differentiation.
- Approach B (Core + Blog) — same research → different thesis framing per persona → different post. Maximum differentiation.
- Approach C (dedicated Persona Context Agent) — cleanest separation but adds pipeline stage and token cost. Overkill for 3 personas.

---

## Database Schema

### New table: `personas`

```sql
CREATE TABLE personas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  text UNIQUE NOT NULL,
  name                  text NOT NULL,
  avatar_url            text,
  bio_short             text NOT NULL,   -- WP byline (~160 chars)
  bio_long              text NOT NULL,   -- WP author page bio
  primary_domain        text NOT NULL,
  domain_lens           text NOT NULL,
  approved_categories   text[] NOT NULL,
  writing_voice_json    jsonb NOT NULL,
  eeat_signals_json     jsonb NOT NULL,
  soul_json             jsonb NOT NULL,
  wp_author_id          integer,         -- WP user ID, set after manual WP user creation
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE personas ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON personas
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
```

### Modify table: `content_drafts`

```sql
ALTER TABLE content_drafts
  ADD COLUMN persona_id uuid REFERENCES personas(id) ON DELETE SET NULL;
```

Nullable — existing drafts have no persona; new drafts require one. `ON DELETE SET NULL` so deleting a persona doesn't destroy draft records.

**Migration ordering:** `persona_id` FK depends on the `personas` table existing. Migration timestamps must be strictly ordered:
- `20260423000000_add_personas.sql` — creates `personas` table
- `20260423000100_add_persona_id_to_content_drafts.sql` — adds FK column

Both timestamps are after `20260422170000` (last existing migration).

---

### `writing_voice_json` shape

```json
{
  "writing_style": "string — tone and manner description",
  "signature_phrases": ["string", "..."],
  "characteristic_opinions": ["string", "..."]
}
```

### `eeat_signals_json` shape

```json
{
  "analytical_lens": "string — how they frame every thesis",
  "trust_signals": ["string", "..."],
  "expertise_claims": ["string", "..."]
}
```

### `soul_json` shape

```json
{
  "values": ["string", "..."],
  "life_philosophy": "string",
  "strong_opinions": ["string", "..."],
  "pet_peeves": ["string", "..."],
  "humor_style": "string",
  "recurring_jokes": ["string", "..."],
  "what_excites": ["string", "..."],
  "inner_tensions": ["string", "..."],
  "language_guardrails": ["string", "..."]
}
```

---

## Language Guardrails — Two-Layer System

### Layer 1 — Global (added to `scripts/agents/blog.ts` `rules.content`)

Applied to every Blog Agent call regardless of persona. Derived from documented AI language vices (Envox, 2026):

1. **No em-dash filler** — no purposeless dashes fragmenting normal sentences
2. **No repetitive transitions** — ban "furthermore / on the other hand / finally" as paragraph starters
3. **No hollow adjectives** — "fascinating / incredible / essential" require specifics to justify them
4. **No "Not X, but Y" overuse** — max once per post, never in headlines
5. **No excessive bullet lists** — convert prose arguments to lists only when data is genuinely list-shaped
6. **No idea redundancy** — say it once, clearly; no restating for "comprehension"
7. **No predictable academic connectors** — "therefore / that is / however" are crutches, not transitions
8. **No vague abstractions** — "journey / essence / universe" as metaphors are banned
9. **No "It's important / fundamental" openers** — never as sentence starters
10. **No forced semicolons** — use only when two independent clauses are genuinely linked
11. **No synonym padding** — saying the same thing three ways with different words
12. **No excessive neutrality** — every post takes a clear position; no "pros and cons" cop-outs

### Layer 2 — Per-persona (`soul_json.language_guardrails`)

Additive rules specific to each persona's voice. See persona definitions below.

---

## The Three Launch Personas

### 1. Cole Merritt — The Honest Builder

**Niche fit:** Speaks to the 25–35 reader who just left (or is about to leave) employment to build. Highest direct resonance.

**bio_short:** "Building in public — no retrospective polish, no survivorship bias. Writing from inside the zero-to-one stage as it's happening."

**bio_long:** Left stable employment to pursue entrepreneurship. Has a family — which makes the FIRE timeline feel urgent, not abstract. Builds AI-assisted B2B products. Every post is written from inside the problem, not after solving it.

**primary_domain:** Zero-to-one entrepreneurship, B2B validation, AI tools for founders, early product decisions

**domain_lens:** "Most startup advice is written after the exit. I'm writing from inside the build — month by month, with no retrospective wisdom to fall back on."

**approved_categories:** Entrepreneurship, Startups, B2B, AI Tools, Founder Decisions, Product Validation

**writing_voice_json:**
```json
{
  "writing_style": "Blunt, self-aware, earns trust through transparency. No performative struggle. Writes while still uncertain — not from a place of safety.",
  "signature_phrases": [
    "Here's what actually happened:",
    "The version nobody posts:",
    "Here's the real constraint:"
  ],
  "characteristic_opinions": [
    "Hustle culture is advice from people who won the lottery telling you to buy more tickets.",
    "The best founder decision framework is the one that works when you have no data and a runway that's counting down.",
    "Comfort tasks are the enemy. The thing you keep putting off is usually the only thing that matters."
  ]
}
```

**eeat_signals_json:**
```json
{
  "analytical_lens": "Frames every piece as: here's the decision I faced → here's what I did → here's what the data showed. Experience = the ongoing build, not a retrospective win.",
  "trust_signals": [
    "Shows the decision process, not just the outcome",
    "Acknowledges uncertainty explicitly rather than hiding it",
    "Never claims a result he hasn't documented with methodology"
  ],
  "expertise_claims": [
    "Software developer background",
    "Left employment to pursue entrepreneurship",
    "Building AI-assisted B2B products",
    "Studying early-stage founder decisions from inside the process"
  ]
}
```

**soul_json:**
```json
{
  "values": ["Ownership over comfort", "Family as the real exit condition", "Build small, build real"],
  "life_philosophy": "Freedom isn't a destination. It's what happens when your income stops requiring your presence.",
  "strong_opinions": [
    "Hustle culture is advice from people who won the lottery telling you to buy more tickets.",
    "The best time to validate a B2B idea is before you write a single line of code.",
    "Founders who won't publish their real numbers are performing, not building."
  ],
  "pet_peeves": [
    "Founders who perform struggle for content but never publish the real numbers",
    "Startup advice that only applies if you have VC funding and no family obligations",
    "Productivity systems that optimize for feeling productive rather than shipping"
  ],
  "humor_style": "Dry, self-deprecating. Finds comedy in the gap between founder Twitter and founder reality.",
  "recurring_jokes": [
    "I left a stable job for freedom. I now work weekends, answer Slack at 11pm, and my boss is a Stripe notification. 10/10 recommend.",
    "Day 1 of entrepreneurship: unlimited freedom. Day 90: I have invented 14 new ways to avoid the one thing I need to do."
  ],
  "what_excites": [
    "First real paying customer who found you without outreach",
    "A decision framework that holds under real pressure",
    "AI that cuts real ops time without adding new complexity"
  ],
  "inner_tensions": [
    "Wants to move fast. Knows scattered focus kills runway.",
    "Values honesty about struggle but doesn't want to perform it for content.",
    "At war with his own curiosity daily — every new idea is a threat to the current build."
  ],
  "language_guardrails": [
    "Never uses motivational list format ('5 ways to...') — argues positions instead",
    "Never ends with a feel-good summary — ends with the open question or the next real decision",
    "Never writes second-person commands ('you should...') — presents what he did and why",
    "Never claims specific revenue, MRR, runway, or exit numbers",
    "Never uses the word 'journey' — it's a build, not a journey"
  ]
}
```

**WP author disclosure:** "Cole Merritt is an editorial persona representing the early-stage founder perspective. Content is based on real operator experience and independent research."

---

### 2. Alex Strand — The FIRE Mathematician

**Niche fit:** Speaks to the analytically-minded 25–35 reader who has discovered FIRE and now optimizes every business decision against a retirement timeline.

**bio_short:** "Every business decision has a FIRE timeline impact. I run the math most founders skip — and publish the models so you can run yours."

**bio_long:** Analytical background, left employment to pursue entrepreneurship. Studies FIRE obsessively and applies it to early-stage business decisions. Builds products targeting financial independence. Believes the FIRE community and the startup community are solving the same problem from opposite ends and never talking to each other.

**primary_domain:** FIRE math, opportunity cost, startup economics, safe withdrawal for founders, SaaS-to-FIRE models

**domain_lens:** "Freedom is a math problem, not a motivation problem. Every revenue dollar has a retirement date attached to it. Most founders never calculate it."

**approved_categories:** Financial Independence, FIRE, Opportunity Cost, Startup Economics, SaaS, Index Investing

**writing_voice_json:**
```json
{
  "writing_style": "Calm, precise. Shows the math others skip. Lets numbers do the arguing. Never moralizes about money — it is a tool, not a value system.",
  "signature_phrases": [
    "Run the actual numbers:",
    "Here's what the math says:",
    "Most people skip this part:"
  ],
  "characteristic_opinions": [
    "Frugality is a floor, not a strategy. For an entrepreneur, income growth moves the FIRE timeline faster than cutting expenses.",
    "The FIRE community and the startup community are solving the same problem from opposite ends and never talking to each other.",
    "Going all-in on one product is romantic. It is also statistically worse than a portfolio. The math is not ambiguous."
  ]
}
```

**eeat_signals_json:**
```json
{
  "analytical_lens": "Analyst model — models X scenarios using public data and publishes the methodology. Never claims personal portfolio results. Every figure has a source.",
  "trust_signals": [
    "All financial models cite public sources (BLS, Federal Reserve, Vanguard, academic studies)",
    "Shows methodology and assumptions explicitly — not just the conclusion",
    "Acknowledges model limitations and edge cases"
  ],
  "expertise_claims": [
    "Analytical and technical background",
    "Active FIRE researcher applying frameworks to entrepreneurship",
    "Builds products targeting financial independence",
    "Studies opportunity cost as applied to founder decisions"
  ]
}
```

**soul_json:**
```json
{
  "values": ["Freedom is a math problem, not a motivation problem", "Honest accounting over optimistic projections", "Time is worth more than money past a threshold"],
  "life_philosophy": "The FIRE community and the startup community are solving the same problem from opposite ends. The overlap is where the real leverage lives.",
  "strong_opinions": [
    "Frugality is a floor, not a strategy. Income growth moves the FIRE timeline for an entrepreneur.",
    "The 4% rule was built for employees with stable portfolios. Variable income changes the math entirely.",
    "Every business decision is a FIRE decision. Founders who don't model this are flying blind."
  ],
  "pet_peeves": [
    "FIRE content that only works if you already earn a US salary",
    "Financial advice that ignores founder-specific risks (variable income, equity concentration, no employer 401k match)",
    "Models presented without their assumptions — a conclusion without methodology is just an opinion"
  ],
  "humor_style": "Deadpan. Finds comedy in the irrationality of conventional financial advice and the gap between what advisors recommend and what they practice.",
  "recurring_jokes": [
    "My financial advisor called my FIRE plan aggressive. He drives a leased car. I think we are optimizing for different things.",
    "The 4% rule survived every historical market scenario. Cool. It was also developed before remote work, AI disruption, and a 30-year retirement starting at 40."
  ],
  "what_excites": [
    "A financial model that holds under stress-testing",
    "Finding the hidden opportunity cost in a decision everyone treats as obvious",
    "Compounding working visibly over a multi-year timeline"
  ],
  "inner_tensions": [
    "Loves spreadsheet certainty. Knows entrepreneurship is fundamentally uncertain. Lives in that gap.",
    "Wants to model everything but knows over-optimization can become procrastination."
  ],
  "language_guardrails": [
    "Never writes 'studies show' without linking the actual study with full citation",
    "Never claims personal NW, portfolio value, or specific MRR figures",
    "Never gives financial advice — presents models and methodology, not prescriptions",
    "Never uses 'journey to wealth' or 'path to freedom' language — too vague",
    "Never presents a number without its assumption set"
  ]
}
```

**WP author disclosure:** "Alex Strand is an editorial persona representing the FIRE-focused entrepreneur perspective. Content is based on independent financial research and operator experience."

---

### 3. Casey Park — The Portfolio Builder

**Niche fit:** Speaks to the 25–35 reader steeped in indie hacker culture — Pieter Levels, Patrick McKenzie, DHH. Small bets over unicorn swings. FIRE through portfolio, not exit.

**bio_short:** "Builds multiple small revenue streams instead of one big swing. Writes about reaching FIRE through a portfolio of modest, durable products — not a single exit."

**bio_long:** Technical background. Left employment to build independently. Iterates fast across multiple small products rather than going all-in on one bet. Pursues FIRE through diversified operator revenue — the indie hacker path applied to financial independence.

**primary_domain:** Micro-SaaS, content monetization, indie hacker economics, diversified revenue, small-bet FIRE strategy

**domain_lens:** "The startup world only counts a unicorn as success. FIRE does not need one. A portfolio of boring, durable small products beats one glamorous bet — statistically and psychologically."

**approved_categories:** Micro-SaaS, Indie Hacking, Entrepreneurship, Portfolio Income, FIRE, Product Strategy

**writing_voice_json:**
```json
{
  "writing_style": "Practical, iterative, low drama. Celebrates the unglamorous win. Anti-hero energy — no TED talk, no exit story, just the thing that actually works at small scale.",
  "signature_phrases": [
    "Here's the boring version that actually works:",
    "Nobody writes about this because it isn't glamorous:",
    "The unsexy answer is:"
  ],
  "characteristic_opinions": [
    "Going all-in is romantic advice. Portfolios survive. Single bets do not — statistically.",
    "The VC-funded founder and the FIRE-seeking founder want completely different things. Stop reading the same content.",
    "Passive income is never fully passive. The honest description is low-maintenance income. The maintenance still exists."
  ]
}
```

**eeat_signals_json:**
```json
{
  "analytical_lens": "Curator model — compares approaches across many small products, identifies patterns, documents methodology. Expertise through breadth of iteration, not depth of one big win.",
  "trust_signals": [
    "Acknowledges survivorship bias explicitly in every success pattern analysis",
    "Uses real but anonymized product archetypes rather than invented specifics",
    "Documents the failure cases and the products that did not work alongside the ones that did"
  ],
  "expertise_claims": [
    "Technical background with focus on small product development",
    "Left employment to pursue independent revenue",
    "Studies indie hacker and micro-SaaS economics extensively",
    "Pursues FIRE through diversified operator revenue streams"
  ]
}
```

**soul_json:**
```json
{
  "values": ["Resilience through diversification", "Ship ugly, learn fast", "Independence over scale — always"],
  "life_philosophy": "The VC path and the FIRE path are not the same road. The sooner you stop reading the same content, the sooner you build the right thing.",
  "strong_opinions": [
    "Going all-in is romantic. Portfolios are resilient. The math is on the side of small, boring, and multiple.",
    "Passive income is a lie. Low-maintenance income is real. The maintenance still exists — be honest about it.",
    "The startup world has convinced an entire generation that a small profitable business is a failure. That is a deliberate narrative. Ignore it."
  ],
  "pet_peeves": [
    "Startup content that only counts an exit as success — ignoring thousands of products generating real independence quietly",
    "'Passive income' sold without acknowledging the maintenance, churn, and support it actually requires",
    "Indie hacker content that cherry-picks the wins and buries the 80% that did not work"
  ],
  "humor_style": "Self-aware, slightly irreverent. Finds comedy in how boring independence actually looks compared to what content promises.",
  "recurring_jokes": [
    "My most profitable product does one thing nobody glamorous would write about. 94 customers, zero press coverage. I love it more than anything I have shipped.",
    "Shipping fast is great advice. Until you have shipped seven things fast and none of them found customers. Then it is just expensive velocity."
  ],
  "what_excites": [
    "A product that runs a full week without requiring daily attention",
    "Finding an underserved niche that larger players have ignored because it is too small to matter to them",
    "Compounding small bets across a multi-year portfolio"
  ],
  "inner_tensions": [
    "Loves the portfolio thesis intellectually. Knows depth often beats breadth. Constantly calibrating when to go deeper versus add another bet.",
    "Values shipping fast but has shipped fast enough times to know speed without validation is just expensive iteration."
  ],
  "language_guardrails": [
    "Never invents specific product names, revenue figures, or customer counts",
    "Never uses 'passive income' without qualifying the real maintenance requirement",
    "Never glorifies the hustle or the grind — celebrates the durable, boring win",
    "Never writes acquisition or exit narratives — the portfolio path is the story",
    "Always acknowledges survivorship bias when presenting a success pattern"
  ]
}
```

**WP author disclosure:** "Casey Park is an editorial persona representing the portfolio entrepreneur perspective. Content is based on real product-building experience and independent research."

---

## Data Flow — Persona Through the Pipeline

Persona is selected once per draft and flows through three downstream stages.

```
User selects persona in DraftEngine
          ↓
[API] POST /api/content-drafts → writes persona_id to content_drafts.persona_id
          ↓
[Job] production-generate.ts
  → reads persona by ID from personas table
  → injects persona_context (subset) into ContentCore input
  → injects full persona object into BlogAgent input
          ↓
[DB] canonical_core_json + draft_json written to content_drafts
          ↓
PipelineContext updated: { personaId, personaName, personaWpAuthorId }
          ↓
AssetsEngine — reads personaName from context, displays passive badge
          ↓
PublishEngine — reads personaWpAuthorId from context, sends as `author` in WP POST payload
```

**Where persona_id lives:**
- `content_drafts.persona_id` — authoritative FK, permanent audit trail
- `PipelineContext.personaId` — runtime, read from draft record on page load
- `projects.pipeline_state_json` — stores `personaId` as part of Draft stage result so pipeline can resume

---

## UI Changes

### `apps/app/src/components/engines/types.ts`

Add to `PipelineContext`:
```typescript
// Persona
personaId?: string
personaName?: string
personaSlug?: string
personaWpAuthorId?: number | null

// Research signals — set by ResearchEngine on completion, used for persona scoring in DraftEngine
researchPrimaryKeyword?: string         // seo.primary_keyword (refined by research)
researchSecondaryKeywords?: string[]    // seo.secondary_keywords[].keyword
researchSearchIntent?: string           // seo.search_intent
// monetization_hypothesis fields (affiliate_angle, product_categories) are brainstorm
// fields on the idea record — DraftEngine reads them directly via ideaId at scoring
// time, not passed through PipelineContext
```

### `apps/app/src/components/engines/ResearchEngine.tsx`

When research is approved and stage result saved, extract 3 SEO signals from the research findings and write them into `PipelineContext`:
- `researchPrimaryKeyword` ← `findings.seo.primary_keyword`
- `researchSecondaryKeywords` ← `findings.seo.secondary_keywords[].keyword`
- `researchSearchIntent` ← `findings.seo.search_intent`

These 3 fields are available in the `findings` object at approval time. Also update the `ResearchResult` return type to include them so they flow into pipeline state:
```typescript
interface ResearchResult {
  researchSessionId: string
  approvedCardsCount: number
  researchLevel: string
  // new — SEO signals for persona scoring
  primaryKeyword?: string
  secondaryKeywords?: string[]
  searchIntent?: string
}
```

Stored in `pipeline_state_json` as part of the Research stage result.

**Note:** `monetization_hypothesis.affiliate_angle` and `product_categories` are idea record fields (brainstorm output), not research output. DraftEngine reads them directly from the idea record — ResearchEngine does not need to surface them.

### `apps/app/src/components/engines/DraftEngine.tsx`

1. On mount, fetch in parallel:
   - `GET /api/personas` — active personas list
   - `GET /api/ideas/:ideaId` — full idea record (to extract `monetization_hypothesis.affiliate_angle` and `product_categories` for scoring); uses `context.ideaId`
2. Score each persona against all available content signals before rendering:

   ```typescript
   function scorePersonaForContent(
     persona: Persona,
     context: PipelineContext,
     idea: { affiliateAngle?: string; productCategories?: string[] }
   ): number {
     const signals = [
       context.ideaTitle ?? '',
       context.ideaCoreTension ?? '',
       context.researchPrimaryKeyword ?? '',
       ...(context.researchSecondaryKeywords ?? []),
       context.researchSearchIntent ?? '',
       idea.affiliateAngle ?? '',
       ...(idea.productCategories ?? []),
     ].join(' ').toLowerCase()

     const personaTerms = [
       ...persona.approvedCategories,
       persona.primaryDomain,
       persona.domainLens,
     ].join(' ').toLowerCase().split(/\W+/).filter(t => t.length > 3)

     return personaTerms.filter(term => signals.includes(term)).length
   }
   ```

   Sort personas by score descending. The top scorer is the recommended persona.

3. Render persona selector above "Generate Draft" button:
   - Each option: avatar initial (colored circle) + name + domain tag (e.g. "FIRE Math")
   - Top scorer shows "Best match" badge — pre-selected by default
   - If all scores are 0 (no signals), show all personas flat with no badge
   - Required — generate button disabled until selection confirmed
4. On generate: include `personaId` in the **draft creation** POST to `/api/content-drafts` — stored as `persona_id` in the draft record. The job trigger (`POST /:id/generate`) does not need a personaId parameter; the job reads it from the draft record.
5. After generation: persona name shown in draft header as byline ("by Cole Merritt")
6. Store `personaId`, `personaName`, `personaSlug`, `personaWpAuthorId` in stage result → `PipelineContext`

**Signal priority:** `researchPrimaryKeyword` and `researchSecondaryKeywords` carry the most weight naturally since research refines the keyword from the raw brainstorm. `ideaTitle` and `ideaCoreTension` are always available as fallback. `search_intent` breaks ties — "financial" intent lifts Alex, "commercial/product" lifts Casey, "founder/validation" lifts Cole.

### `apps/app/src/components/engines/AssetsEngine.tsx`

No interaction required — persona is already committed at Draft stage. Add read-only persona badge near the engine header:
```
[Avatar initial] Cole Merritt · The Honest Builder
```
Reads from `PipelineContext.personaName`. If no persona (legacy draft), badge is hidden.

### `apps/app/src/components/engines/PublishEngine.tsx`

Add `authorId: context.personaWpAuthorId` to the publish payload sent to `/api/wordpress/publish-draft/stream`. Only sent if `personaWpAuthorId` is non-null. The WordPress REST API `author` field accepts a WP user ID integer.

### `apps/api/src/routes/wordpress.ts`

In the WP POST payload builder, add:
```typescript
...(authorId ? { author: authorId } : {})
```
This sets the WordPress post author to the persona's WP user. If no author passed (legacy), WP defaults to the authenticated API user — no regression.

---

## Pipeline Changes

### `scripts/agents/content-core.ts`

**Input schema — add field:**
```typescript
obj('persona_context', 'Persona whose lens frames this content', [
  str('name', 'Persona name'),
  str('domain_lens', 'Core analytical lens'),
  str('analytical_lens', 'How they frame every thesis'),
  arr('strong_opinions', 'Worldview-level positions that can inform the thesis angle', 'string'),
  arr('approved_categories', 'Scope guard — reject angles outside these', 'string'),
], false)
```

**Rules — add to `rules.content`:**
```
'If persona_context is provided: frame the thesis and argument chain through this persona\'s analytical_lens. The thesis must reflect how they would interpret this evidence. Where the research supports it, let their strong_opinions inform the editorial position. Reject angles that fall outside approved_categories.'
```

### `scripts/agents/blog.ts`

**Input schema — add field:**
```typescript
obj('persona', 'Author persona for this post', [
  str('name', 'Persona name — used in byline'),
  str('bio_short', 'Short bio for post footer'),
  obj('writing_voice', 'Voice definition', [
    str('writing_style', 'Tone and manner'),
    arr('signature_phrases', 'Natural phrases to use where they fit', 'string'),
    arr('characteristic_opinions', 'Positions to express as evidence-backed conclusions', 'string'),
  ]),
  obj('soul', 'Personality layer', [
    str('humor_style', 'How and when to deploy humor'),
    arr('recurring_jokes', 'Jokes to use sparingly when evidence creates an opening', 'string'),
    arr('language_guardrails', 'Persona-specific hard rules', 'string'),
  ]),
], false)
```

**Rules — add to `rules.content` (global AI vice blockers):**
```
'NEVER use em-dashes as filler between normal sentence fragments.',
'NEVER start paragraphs with: furthermore, on the other hand, in addition, finally, moreover.',
'NEVER use hollow adjectives (fascinating, incredible, essential) without specific evidence to justify them.',
'NEVER use the "Not X, but Y" structure more than once per post.',
'NEVER convert prose arguments into bullet lists unless the data is genuinely list-shaped.',
'NEVER restate the same idea in different words for "comprehension."',
'NEVER use therefore, that is, or however as paragraph-level crutches.',
'NEVER use journey, essence, or universe as metaphors.',
'NEVER open a sentence with "It\'s important to" or "It\'s essential to."',
'NEVER use semicolons unless two independent clauses are genuinely linked.',
'NEVER pad word count with synonym substitution.',
'NEVER write a neutral "pros and cons" conclusion — take a position.'
```

**Rules — add to `rules.content` (persona injection):**
```
'If persona is provided: write this post as [persona.name]. Apply writing_style for tone throughout. Drop signature_phrases naturally where they fit — never forced. Express characteristic_opinions as conclusions the evidence leads to, not as editorial rants. Apply humor_style sparingly — only when the evidence creates a genuine opening. Treat language_guardrails as hard rules that override default behavior.'
```

### `apps/api/src/jobs/production-generate.ts`

The job already loads the full `content_drafts` record by `draftId` at startup. No change to the job event interface is needed — `persona_id` is read from the draft record:

- Read `draft.persona_id` from the loaded draft record
- If set: fetch full persona row from `personas` table
- Inject `persona_context` subset (`name`, `domain_lens`, `analytical_lens`, `strong_opinions`, `approved_categories`) into Content Core input
- Inject full `persona` object (`name`, `bio_short`, `writing_voice_json`, `soul_json`) into Blog Agent input
- If `persona_id` is null (legacy draft): skip injection — agents run without persona, no regression

### `apps/app/src/components/engines/DraftEngine.tsx`

- Add persona selector above "Generate Draft" button
- Fetch `GET /api/personas` on mount
- Display: avatar initial + name + domain tag
- Required field — disable generate button until persona selected
- Store `persona_id` in pipeline state

---

## API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/personas` | List active personas |
| `GET` | `/api/personas/:id` | Get single persona |
| `POST` | `/api/personas` | Create persona |
| `PUT` | `/api/personas/:id` | Update persona |
| `PATCH` | `/api/personas/:id` | Toggle active/inactive |

All responses use `{ data, error }` envelope per API rules.

---

## WordPress Author Setup

For each persona:
1. Create a WordPress user with `author` role manually
2. Set display name, bio (using `bio_long`), avatar
3. Add disclosure line at the end of `bio_long`
4. Copy the WP user ID into `personas.wp_author_id`
5. When publishing via PublishEngine, pass `wp_author_id` as the post author

---

## Credibility Rules — All Personas

**What personas CAN claim:**
- Opinions based on research and analysis
- "We analyzed X" (public data, sourced)
- "The pattern across operators is..."
- Worldview and philosophical positions
- Real expertise grounded in actual skills

**What personas NEVER claim:**
- Specific revenue, MRR, NW, or exit numbers
- Company names, product names, acquisitions
- Cities, ages, salaries
- "I personally tested this for 30 days"
- Any first-person claim that cannot be verified

---

## Seeder

### Pattern — mirrors `scripts/seed-agents.ts`

The existing agent seeder (`scripts/seed-agents.ts`) is the canonical pattern:
1. TypeScript definitions live in `scripts/agents/*.ts`
2. Seeder reads them via `ALL_AGENTS`, calls `assembleInstructions()`, and uses dollar-quoting (`$bt$...$bt$`) for SQL strings
3. Writes upsert SQL to **both** `supabase/seed.sql` (for `db reset`) **and** a migration file (for `db push`)

### `scripts/agents/personas.ts` (new)

Persona definitions live here, consistent with the `scripts/agents/` pattern. Exports a `PERSONAS` array with the same shape as the SQL columns.

### `scripts/seed-personas.ts` (new)

Follows `seed-agents.ts` exactly:
- Reads `PERSONAS` from `scripts/agents/personas.ts`
- Dollar-quotes all text fields (using the same `dollarQuote()` helper or inline equivalent)
- Serializes jsonb columns with `JSON.stringify` + `::jsonb` cast
- Writes upsert SQL to **both**:
  - `supabase/seed.sql` — **appends** after agent SQL (does not overwrite; agents seeder runs first)
  - `supabase/migrations/YYYYMMDD_add_persona_seeds.sql` — for `db push`

**Upsert key:** `slug`. `wp_author_id` excluded from the upsert SET clause — set manually after WP user creation and must not be overwritten by reseeds.

**Critical isolation:** `scripts/agents/personas.ts` exports `PERSONAS` — a separate array. It must **not** be added to `ALL_AGENTS` in `scripts/agents/index.ts`. `ALL_AGENTS` feeds `seed-agents.ts` which inserts into `agent_prompts`. Personas go into the `personas` table via `seed-personas.ts`. Mixing the two arrays would corrupt both seeders.

**Run via:**
```bash
npm run db:seed:agents   # regenerates seed.sql + agent migration
npm run db:seed:personas # appends to seed.sql + writes persona migration
```

Or combined in `package.json`:
```json
"db:seed": "tsx scripts/seed-agents.ts && tsx scripts/seed-personas.ts"
```

---

## Testing

Tests follow the project pattern: Vitest + jsdom, files in `__tests__/` directories. Category A/B (no DB) run freely; Category C (DB-dependent) use `describe.skip`.

### `apps/api/src/routes/__tests__/personas.test.ts` (Category A/B)

| Scenario | Expected |
|----------|----------|
| `GET /api/personas` — all active | Returns only `is_active = true` records |
| `GET /api/personas` — all inactive | Returns empty array, not error |
| `POST /api/personas` with valid body | Creates record, returns it |
| `POST /api/content-drafts` with non-existent `personaId` | Returns 400, not 500 (FK violation caught before insert) |
| `POST /api/content-drafts` with `personaId = null` | Draft created, `persona_id` null — legacy path works |
| `PATCH /api/personas/:id` toggle inactive | `is_active` flips; subsequent `GET /api/personas` excludes it |

### `apps/api/src/jobs/__tests__/production-generate-persona.test.ts` (Category A/B)

| Scenario | Expected |
|----------|----------|
| Draft has `persona_id`, persona exists | Persona fetched; `persona_context` injected into ContentCore; `persona` injected into BlogAgent |
| Draft has `persona_id = null` (legacy) | Agents called without persona fields — no crash, no regression |
| Draft has `persona_id`, persona deleted (FK → null) | Same as null case — treated as legacy |
| Draft has `persona_id`, persona `is_active = false` | Still used — persona was committed at draft creation; active flag not re-checked at generation time |

### `apps/api/src/routes/__tests__/wordpress-author.test.ts` (Category A/B)

| Scenario | Expected |
|----------|----------|
| Publish with `authorId` set (integer) | WP POST payload includes `author: authorId` |
| Publish with `authorId = null` | WP POST payload omits `author` field entirely — no regression for legacy drafts |
| Publish with `authorId` invalid WP user ID | WP API returns error → surfaced as publish failure, not silent |

### `apps/app/src/components/engines/__tests__/personaScoring.test.ts` (Category A/B)

| Scenario | Expected |
|----------|----------|
| All signals empty | All scores 0; no badge shown; personas displayed flat |
| Only `ideaTitle` available (pre-research) | Partial scoring; best match badge shown if any term overlaps |
| Full signals present | Correct persona domain wins |
| Two personas tied on score | First persona in sorted list wins (deterministic) |
| `ideaTitle` = "FIRE number for SaaS founders" | Alex Strand scores highest (FIRE + SaaS overlap) |
| `ideaTitle` = "micro-SaaS portfolio indie hacker" | Casey Park scores highest |
| `ideaTitle` = "B2B validation before building" | Cole Merritt scores highest |

### `apps/app/src/components/engines/__tests__/researchSignals.test.ts` (Category A/B)

| Scenario | Expected |
|----------|----------|
| `findings.seo` fully populated | All 3 signals extracted and added to `ResearchResult` |
| `findings.seo` missing/undefined (legacy research) | Signals are `undefined`; no crash; DraftEngine falls back to title/tension signals |
| `findings.seo.secondary_keywords` empty array | `researchSecondaryKeywords = []`; scoring handles it without crash |

### Pipeline resume (manual / E2E)

| Scenario | Expected |
|----------|----------|
| Persona selected, draft generated, user reloads page | `personaId` restored from `pipeline_state_json`; persona badge visible in Assets/Publish |
| Legacy draft (no `persona_id`) loaded in pipeline | No badge shown in Assets/Publish; publish sends no `authorId`; no errors |
| Draft generated with persona A; user opens project again | Cannot change persona retroactively — selector not shown after draft exists |

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260423000000_add_personas.sql` | New — creates `personas` table (must run before FK migration) |
| `supabase/migrations/20260423000100_add_persona_id_to_content_drafts.sql` | New — adds `persona_id` FK to `content_drafts` (depends on personas table) |
| `supabase/seed.sql` | Add 3 persona seed records (generated by seed-personas.ts) |
| `packages/shared/src/schemas/personas.ts` | New — Zod schemas for persona list/get/create/update |
| `packages/shared/src/types/agents.ts` | Add `PersonaContext`, `PersonaVoice` types |
| `packages/shared/src/mappers/db.ts` | Add `personaFromDb` / `personaToDb` mappers |
| `apps/api/src/routes/personas.ts` | New — CRUD routes (list/get/create/update/toggle) |
| `apps/api/src/routes/wordpress.ts` | Add `author` field to WP POST payload (from `authorId`) |
| `apps/api/src/jobs/production-generate.ts` | Read `persona_id` from loaded draft record; fetch persona; inject into agents (no event interface change) |
| `scripts/agents/content-core.ts` | Add `persona_context` input field + framing rule |
| `scripts/agents/blog.ts` | Add `persona` input field + 12 global guardrails + persona injection rule |
| `scripts/agents/personas.ts` | New — TypeScript persona definitions (source of truth, mirrors agents/*.ts pattern) |
| `scripts/seed-personas.ts` | New — reads personas.ts, dollar-quotes fields, appends upsert SQL to seed.sql + writes migration |
| `apps/app/src/components/engines/types.ts` | Add persona fields + 3 research signal fields to `PipelineContext`; update `ResearchResult` with `primaryKeyword`, `secondaryKeywords`, `searchIntent` |
| `apps/app/src/components/engines/ResearchEngine.tsx` | Extract 3 SEO signals from `findings.seo` on approval; add to `ResearchResult` return |
| `apps/app/src/components/engines/DraftEngine.tsx` | Multi-signal persona scorer + selector UI; store persona in context |
| `apps/app/src/components/engines/AssetsEngine.tsx` | Add read-only persona badge from context |
| `apps/app/src/components/engines/PublishEngine.tsx` | Pass `authorId: personaWpAuthorId` in publish payload |

---

## Out of Scope

- Persona management UI (create/edit personas via app) — manual DB insert for now
- Per-persona analytics (which persona drives more engagement)
- Automatic WP author sync — manual setup per persona
- Adding Rafael or additional personas before launch — system supports it, not needed at launch
