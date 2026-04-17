# Agent Prompts TypeScript Seed

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Replace SQL-authored agent prompt seed with TypeScript source-of-truth that generates both `supabase/seed.sql` (for local `db reset`) and a refresh migration (for remote `db push`). Clone workflow produces correct agent prompts automatically.

**Architecture:** TypeScript agent definitions (`scripts/agents/*.ts`) export typed `AgentDefinition` objects containing structured `SectionsJson`. A runner script reads all definitions, uses `assembleInstructions()` from shared package to build the prompt text, and emits both seed.sql and a migration.

**Tech Stack:** TypeScript, Supabase, tsx, Node.js

---

## Infrastructure Phase

### Task I1: Move SectionsJson types + assembleInstructions to shared package

**Files:**
- Create: `packages/shared/src/agents/types.ts` (moved from apps/web)
- Create: `packages/shared/src/agents/assembleInstructions.ts` (moved from apps/web)
- Create: `packages/shared/src/agents/index.ts` (re-exports)
- Modify: `packages/shared/src/index.ts` (add agents export)
- Delete: `apps/web/src/lib/agents/types.ts`
- Delete: `apps/web/src/lib/agents/assembleInstructions.ts`
- Modify: `apps/web/src/lib/agents/__tests__/assembleInstructions.test.ts` (update imports)
- Modify: `apps/web/src/app/zadmin/(protected)/agents/[slug]/editor.tsx` (update imports)
- Modify: `apps/web/src/components/agents/SchemaBuilder.tsx` (update imports)

- [ ] **Step 1: Create shared files by copying existing content**

Copy `apps/web/src/lib/agents/types.ts` → `packages/shared/src/agents/types.ts` (content unchanged)

Copy `apps/web/src/lib/agents/assembleInstructions.ts` → `packages/shared/src/agents/assembleInstructions.ts` BUT change import:
```typescript
// Before
import type { SectionsJson, SchemaField } from './types';
// After
import type { SectionsJson, SchemaField } from './types.js';
```

Create `packages/shared/src/agents/index.ts`:
```typescript
export * from './types.js';
export * from './assembleInstructions.js';
```

- [ ] **Step 2: Update shared package root index**

In `packages/shared/src/index.ts`, add at top:
```typescript
export * from './agents/index.js';
```

- [ ] **Step 3: Move test file**

Create `packages/shared/src/agents/__tests__/assembleInstructions.test.ts` by copying from `apps/web/src/lib/agents/__tests__/assembleInstructions.test.ts` with updated imports:
```typescript
import { assembleInstructions, buildSchemaExample } from '../assembleInstructions.js';
import type { SectionsJson, SchemaField } from '../types.js';
```

- [ ] **Step 4: Update web consumers to import from shared**

In `apps/web/src/app/zadmin/(protected)/agents/[slug]/editor.tsx`:
- Replace `import { assembleInstructions } from '@/lib/agents/assembleInstructions';` with `import { assembleInstructions } from '@brighttale/shared';`
- Replace `import type { SectionsJson } from '@/lib/agents/types';` with `import type { SectionsJson } from '@brighttale/shared';`

In `apps/web/src/components/agents/SchemaBuilder.tsx`:
- Replace `import type { SchemaField, PromptSchema } from '@/lib/agents/types';` with `import type { SchemaField, PromptSchema } from '@brighttale/shared';`
- Replace `import { buildSchemaExample } from '@/lib/agents/assembleInstructions';` with `import { buildSchemaExample } from '@brighttale/shared';`

- [ ] **Step 5: Delete old web files**

```bash
rm apps/web/src/lib/agents/types.ts
rm apps/web/src/lib/agents/assembleInstructions.ts
rm apps/web/src/lib/agents/__tests__/assembleInstructions.test.ts
rmdir apps/web/src/lib/agents/__tests__
rmdir apps/web/src/lib/agents
```

- [ ] **Step 6: Verify**

```bash
cd /home/hectorlutero/hectorsiman/bright-tale
npm run typecheck
npx vitest run --root packages/shared src/agents/__tests__/
```

Both should PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/agents apps/web/src/
git commit -m "refactor(shared): move SectionsJson + assembleInstructions to shared package"
```

---

### Task I2: AgentDefinition type + helpers in scripts/agents

**Files:**
- Create: `scripts/agents/_types.ts`
- Create: `scripts/agents/_helpers.ts`

- [ ] **Step 1: Create _types.ts**

```typescript
// scripts/agents/_types.ts
import type { SectionsJson } from '@brighttale/shared';

export interface AgentDefinition {
  slug: string;
  name: string;
  stage: string;
  recommendedProvider?: string | null;
  recommendedModel?: string | null;
  sections: SectionsJson;
}
```

- [ ] **Step 2: Create _helpers.ts — common field templates to reduce repetition**

```typescript
// scripts/agents/_helpers.ts
import type { SchemaField } from '@brighttale/shared';

/** Empty object helper for section initialization */
export function emptySections() {
  return {
    header: { role: '', context: '', principles: [], purpose: [] },
    inputSchema: { name: '', fields: [] },
    outputSchema: { name: '', fields: [] },
    rules: { formatting: [], content: [], validation: [] },
    customSections: [],
  };
}

/** JSON formatting rules shared by all agents */
export const STANDARD_JSON_RULES = [
  'Output must be valid JSON, parseable by JSON.parse()',
  'No em-dashes (-), use regular dashes (-)',
  'No curly quotes, use straight quotes only',
  'Use literal newlines in string values for multi-line content',
];

/** Shorthand field constructors to keep agent files readable */
export function str(name: string, description: string, required = true): SchemaField {
  return { name, type: 'string', required, description };
}

export function num(name: string, description: string, required = true): SchemaField {
  return { name, type: 'number', required, description };
}

export function bool(name: string, description: string, required = true): SchemaField {
  return { name, type: 'boolean', required, description };
}

export function obj(name: string, description: string, fields: SchemaField[], required = true): SchemaField {
  return { name, type: 'object', required, description, fields };
}

export function arr(name: string, description: string, itemType: 'string' | 'number' | 'boolean', required = true): SchemaField {
  return { name, type: 'array', required, description, items: { type: itemType } };
}

export function arrOf(name: string, description: string, fields: SchemaField[], required = true): SchemaField {
  return { name, type: 'array', required, description, items: { type: 'object', fields } };
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/agents/_types.ts scripts/agents/_helpers.ts
git commit -m "feat(scripts): AgentDefinition type + schema field helpers for TS agent seed"
```

---

### Task I3: Seed runner script

**Files:**
- Create: `scripts/agents/index.ts` (empty placeholder, will populate as agents are added)
- Create: `scripts/seed-agents.ts` (runner)
- Modify: `package.json` (add `db:seed:agents` script)

- [ ] **Step 1: Create empty agents index**

```typescript
// scripts/agents/index.ts
import type { AgentDefinition } from './_types.js';

// Agents are imported + listed here as they're added.
// Each translation task appends one import + one array entry.

export const ALL_AGENTS: AgentDefinition[] = [];
```

- [ ] **Step 2: Create seed runner**

```typescript
#!/usr/bin/env tsx
// scripts/seed-agents.ts
/**
 * Reads TypeScript agent definitions, assembles instructions,
 * and outputs:
 *   1. supabase/seed.sql (regenerated each run, used by `supabase db reset`)
 *   2. supabase/migrations/20260417210000_refresh_agent_prompts.sql (for remote db push)
 *
 * Run: npm run db:seed:agents
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assembleInstructions } from '@brighttale/shared';
import { ALL_AGENTS } from './agents/index.js';

const REPO_ROOT = process.cwd();
const SEED_PATH = join(REPO_ROOT, 'supabase', 'seed.sql');
const MIGRATION_PATH = join(REPO_ROOT, 'supabase', 'migrations', '20260417210000_refresh_agent_prompts.sql');

function dollarQuote(s: string): string {
  let tag = 'bt';
  let n = 0;
  while (s.includes(`$${tag}$`)) tag = `bt${++n}`;
  return `$${tag}$${s}$${tag}$`;
}

function jsonQuote(obj: unknown): string {
  const json = JSON.stringify(obj);
  // Escape single quotes for SQL
  return `'${json.replace(/'/g, "''")}'::jsonb`;
}

function generateUpsertSQL(): string {
  if (ALL_AGENTS.length === 0) {
    return '-- No agents defined. Populate scripts/agents/*.ts and rerun.\n';
  }

  const statements = ALL_AGENTS.map((agent) => {
    const instructions = assembleInstructions(agent.sections);
    const id = `agent-${agent.slug}`;
    return [
      `insert into public.agent_prompts (id, name, slug, stage, instructions, sections_json, recommended_provider, recommended_model, created_at, updated_at)`,
      `values (`,
      `  ${dollarQuote(id)},`,
      `  ${dollarQuote(agent.name)},`,
      `  ${dollarQuote(agent.slug)},`,
      `  ${dollarQuote(agent.stage)},`,
      `  ${dollarQuote(instructions)},`,
      `  ${jsonQuote(agent.sections)},`,
      agent.recommendedProvider ? `  ${dollarQuote(agent.recommendedProvider)},` : `  null,`,
      agent.recommendedModel ? `  ${dollarQuote(agent.recommendedModel)},` : `  null,`,
      `  now(),`,
      `  now()`,
      `)`,
      `on conflict (slug) do update set`,
      `  name = excluded.name,`,
      `  instructions = excluded.instructions,`,
      `  sections_json = excluded.sections_json,`,
      `  recommended_provider = excluded.recommended_provider,`,
      `  recommended_model = excluded.recommended_model,`,
      `  updated_at = now();`,
    ].join('\n');
  });

  return statements.join('\n\n') + '\n';
}

function main() {
  const sql = generateUpsertSQL();

  const header = `-- Generated by scripts/seed-agents.ts — DO NOT EDIT MANUALLY.
-- Source of truth: scripts/agents/*.ts
-- Run: npm run db:seed:agents

`;

  writeFileSync(SEED_PATH, header + sql);
  writeFileSync(MIGRATION_PATH, header + sql);

  console.log(`Wrote ${ALL_AGENTS.length} agents to:`);
  console.log(`  - ${SEED_PATH}`);
  console.log(`  - ${MIGRATION_PATH}`);
}

main();
```

- [ ] **Step 3: Add npm script to package.json**

Edit `package.json`. Find:
```json
    "db:seed": "tsx scripts/generate-seed.ts && supabase db reset",
```

Add BELOW it:
```json
    "db:seed:agents": "tsx scripts/seed-agents.ts",
```

- [ ] **Step 4: Run runner as smoke test**

```bash
cd /home/hectorlutero/hectorsiman/bright-tale
npm run db:seed:agents
```

Expected output: "Wrote 0 agents to: ...". Verify `supabase/seed.sql` contains the "No agents defined" placeholder.

- [ ] **Step 5: Commit**

```bash
git add scripts/agents/index.ts scripts/seed-agents.ts package.json supabase/seed.sql supabase/migrations/20260417210000_refresh_agent_prompts.sql
git commit -m "feat(scripts): seed-agents.ts runner + npm db:seed:agents script"
```

---

## Translation Phase

### Overview

Each translation task follows the same pattern:
1. Read current DB content for the agent from migration `20260413040000_seed_all_agent_prompts.sql`
2. Identify sections: header (role/context/principles/purpose), input schema, output schema, rules, amendments
3. Write new TS file mirroring content but in new format
4. Append to `scripts/agents/index.ts`
5. Run `npm run db:seed:agents` to verify

**Naming fixes to apply during translation:**
- `affiliate_moment` → `affiliate_context` (all agents)
- `argument_chain` → `talking_point_seeds` (podcast input only — keep `argument_chain` in canonical-core output)

**Skip these amendments:**
- F2-048 channel context — runtime-injected by `buildChannelContext()`, would double-inject

**Flatten these amendments into Custom Sections or Rules:**
- F2-045 dual script (video)
- F2-046 full YouTube package (video)
- F2-047 target length (blog/video/podcast/shorts)

---

### Task T1: Translate brainstorm agent

**File:** `scripts/agents/brainstorm.ts`

Read current content at `supabase/migrations/20260413040000_seed_all_agent_prompts.sql` (insert block for slug=`brainstorm`, lines ~9-164 of migration).

Create `scripts/agents/brainstorm.ts` with structure:

```typescript
import type { AgentDefinition } from './_types.js';
import { str, arr, arrOf, obj } from './_helpers.js';
import { STANDARD_JSON_RULES } from './_helpers.js';

export const brainstorm: AgentDefinition = {
  slug: 'brainstorm',
  name: 'Brainstorm Agent',
  stage: 'brainstorm',
  sections: {
    header: {
      role: 'You are BrightCurios\' Brainstorm Agent. You operate as a skeptical content strategist and growth operator, not a writer. Your job is to surface ideas worth validating and kill weak ones early.',
      context: 'BrightCurios is a content brand focused on curiosity, science, productivity, psychology, self-growth, and lifestyle. Its goal is to identify ideas that compound over time, perform across platforms, and justify production investment.',
      principles: [
        'Default to skepticism over optimism',
        'Optimize for tension, relevance, and repurposability',
        'Prefer rejecting ideas early rather than polishing weak ones',
        'Never confuse creativity with viability',
      ],
      purpose: [
        'Generate and validate content ideas only; never write full content',
        'Generate exactly the number of ideas requested',
        'Stress-test each idea for tension, search intent, repurposability, and monetization',
        'Explicitly label weak ideas as `verdict: weak`',
        'Recommend only one idea to move forward',
        'Your output will be used to SELECT ONE IDEA for the Research stage',
      ],
    },
    inputSchema: {
      name: 'BC_BRAINSTORM_INPUT',
      fields: [
        obj('performance_context', 'Context from past performance (optional)', [
          arr('recent_winners', 'Titles/topics that performed well', 'string'),
          arr('recent_losers', 'Titles/topics that underperformed', 'string'),
        ], false),
        obj('theme', 'What to generate ideas about', [
          str('primary', 'Main topic area: psychology, science, productivity, etc.'),
          arr('subthemes', 'Specific angles within theme', 'string'),
        ]),
        str('goal', 'Strategic goal: growth | engagement | monetization | authority'),
        obj('temporal_mix', 'Content type preferences', [
          // use number helper
        ]),
        // ... (full structure)
      ],
    },
    outputSchema: {
      name: 'BC_BRAINSTORM_OUTPUT',
      fields: [
        // ... mirror BC_BRAINSTORM_OUTPUT from DB
      ],
    },
    rules: {
      formatting: STANDARD_JSON_RULES,
      content: [
        'If audience, market, or monetization details are not explicitly provided, infer them based on the selected theme, stated goal, and BrightCurios\' default audience (general, English-speaking, global, curious adults 25-45)',
        'Generate exactly the number of ideas requested',
        'Always include a `recommendation.pick` with clear rationale',
        'Be brutally honest with `verdict` — label weak ideas as `weak`',
      ],
      validation: [
        'Verify the number of ideas matches `ideas_requested`',
        'Verify `recommendation.pick` references a valid `idea_id`',
      ],
    },
    customSections: [],
  },
};
```

**Translation judgment:**
- Preserve ALL existing content from the DB prompt
- Convert YAML schema fields to `SchemaField[]` using helpers
- Move rules bullets from the DB "Rules" section into `rules.content`
- Split validation-like rules ("Verify X") into `rules.validation`

- [ ] **Step 1: Read current DB content**

```bash
grep -A 155 "slug: brainstorm\|slug=brainstorm" supabase/migrations/20260413040000_seed_all_agent_prompts.sql | head -200
```

OR read the insert block in the SQL directly at lines 9-164.

- [ ] **Step 2: Write scripts/agents/brainstorm.ts**

Translate mirroring the content.

- [ ] **Step 3: Register in index**

In `scripts/agents/index.ts`:
```typescript
import type { AgentDefinition } from './_types.js';
import { brainstorm } from './brainstorm.js';

export const ALL_AGENTS: AgentDefinition[] = [
  brainstorm,
];
```

- [ ] **Step 4: Run seed + verify**

```bash
cd /home/hectorlutero/hectorsiman/bright-tale
npm run db:seed:agents
cat supabase/seed.sql | head -30
npm run typecheck
```

Verify: seed.sql contains brainstorm upsert with expected content. Typecheck passes.

- [ ] **Step 5: Commit**

```bash
git add scripts/agents/brainstorm.ts scripts/agents/index.ts supabase/seed.sql supabase/migrations/20260417210000_refresh_agent_prompts.sql
git commit -m "feat(seed): translate brainstorm agent to TS source"
```

---

### Tasks T2-T9: Translate remaining 8 agents

Apply same pattern. One agent per task, one commit per agent.

Order (by complexity, easiest first):
- T2: `research` (agent-2, stage research)
- T3: `content-core` (agent-3a, stage production)
- T4: `blog` (agent-3b-blog, stage production)
- T5: `shorts` (agent-3b-shorts, stage production)
- T6: `podcast` (agent-3b-podcast, stage production) — **rename `argument_chain` → `talking_point_seeds`**
- T7: `engagement` (agent-3b-engagement, stage production)
- T8: `review` (agent-4, stage review)
- T9: `video` (agent-3b-video, stage production) — largest, includes F2-045/046/047 amendments

For each:
1. Read current DB content from migration
2. Translate header/schemas/rules to TS format
3. Fix naming (`affiliate_moment` → `affiliate_context`)
4. Flatten F2-045/046/047 amendments into custom sections (if applicable)
5. Skip F2-048 channel context (runtime-injected)
6. Add to `scripts/agents/index.ts`
7. Run `npm run db:seed:agents`
8. Typecheck
9. Commit

**Video-specific (T9) amendment handling:**
- F2-045 dual script → custom section "Dual Output Requirement"
- F2-046 full YouTube package → custom section "Complete YouTube Package"
- F2-047 target duration → custom section "Target Duration"
- F2-048 channel context → SKIP

---

## Validation Phase

### Task V1: End-to-end seed verification

- [ ] **Step 1: Run seed**

```bash
cd /home/hectorlutero/hectorsiman/bright-tale
npm run db:seed:agents
```

Expected: "Wrote 9 agents to: ..."

- [ ] **Step 2: Verify all agents present in output**

```bash
grep -c "insert into public.agent_prompts" supabase/seed.sql
```

Expected: 9

- [ ] **Step 3: Apply locally (if local Supabase running)**

```bash
npm run db:reset
```

Or apply migration to dev remote:

```bash
npm run db:push:dev
```

- [ ] **Step 4: Sanity-check each agent in admin panel**

Start web app, navigate to `/admin/agents`. For each of the 9 agents:
- Editor shows structured sections (not empty banner)
- Preview tab matches expected content
- Input/Output schemas render correctly

- [ ] **Step 5: Final commit if anything remains**

```bash
git status
```

If clean, done. Otherwise commit.
