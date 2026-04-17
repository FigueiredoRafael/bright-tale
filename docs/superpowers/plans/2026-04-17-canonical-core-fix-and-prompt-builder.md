# Canonical Core Fix + Structured Agent Prompt Builder

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix missing idea context in all content generation engines, then build a structured admin panel for maintaining agent prompts.

**Architecture:** Two independent workstreams. Workstream A adds a `loadIdeaContext()` utility and threads idea data through all prompt builders. Workstream B adds a `sections_json` JSONB column to `agent_prompts`, builds an assembly function, and replaces the textarea editor with a structured form (tabs for header, schemas, rules, custom sections, preview).

**Tech Stack:** TypeScript, Fastify, Supabase, Vitest, React 19, Next.js 16, Tailwind CSS 4, Lucide icons

**Spec:** `docs/superpowers/specs/2026-04-17-canonical-core-fix-and-prompt-builder-design.md`

---

## Workstream A: loadIdeaContext Fix

---

### Task 1: Create `loadIdeaContext` utility

**Files:**
- Create: `apps/api/src/lib/ai/loadIdeaContext.ts`
- Create: `apps/api/src/lib/ai/__tests__/loadIdeaContext.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// apps/api/src/lib/ai/__tests__/loadIdeaContext.test.ts
import { describe, it, expect } from 'vitest';
import { parseDiscoveryData, type IdeaContext } from '../loadIdeaContext.js';

describe('parseDiscoveryData', () => {
  it('extracts scroll_stopper and curiosity_gap from JSON string', () => {
    const raw = JSON.stringify({
      scroll_stopper: 'Did you know 73% fail?',
      curiosity_gap: 'The one thing nobody tells you',
      monetization: {
        affiliate_angle: 'CRM tools',
        product_fit: 'High',
        sponsor_appeal: 'Medium',
      },
      repurpose_potential: {
        blog_angle: 'Listicle',
        video_angle: 'Talking head',
        shorts_hooks: ['Hook 1', 'Hook 2'],
        podcast_angle: 'Interview style',
      },
    });

    const result = parseDiscoveryData(raw);
    expect(result.scroll_stopper).toBe('Did you know 73% fail?');
    expect(result.curiosity_gap).toBe('The one thing nobody tells you');
    expect(result.monetization?.affiliate_angle).toBe('CRM tools');
    expect(result.repurpose_potential?.shorts_hooks).toEqual(['Hook 1', 'Hook 2']);
  });

  it('returns empty object for null input', () => {
    const result = parseDiscoveryData(null);
    expect(result.scroll_stopper).toBeUndefined();
    expect(result.monetization).toBeUndefined();
  });

  it('handles invalid JSON gracefully', () => {
    const result = parseDiscoveryData('not valid json {{{');
    expect(result.scroll_stopper).toBeUndefined();
  });

  it('handles already-parsed object', () => {
    const result = parseDiscoveryData({ scroll_stopper: 'test' });
    expect(result.scroll_stopper).toBe('test');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/lib/ai/__tests__/loadIdeaContext.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/lib/ai/loadIdeaContext.ts
import { createServiceClient } from '../supabase/index.js';

export interface IdeaContext {
  id: string;
  title: string;
  core_tension: string;
  target_audience: string;
  scroll_stopper?: string;
  curiosity_gap?: string;
  monetization?: {
    affiliate_angle?: string;
    product_fit?: string;
    sponsor_appeal?: string;
  };
  repurpose_potential?: {
    blog_angle?: string;
    video_angle?: string;
    shorts_hooks?: string[];
    podcast_angle?: string;
  };
  tags?: string[];
}

interface DiscoveryFields {
  scroll_stopper?: string;
  curiosity_gap?: string;
  monetization?: IdeaContext['monetization'];
  repurpose_potential?: IdeaContext['repurpose_potential'];
}

export function parseDiscoveryData(raw: unknown): DiscoveryFields {
  if (!raw) return {};
  let obj: Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  } else if (typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  } else {
    return {};
  }

  return {
    scroll_stopper: typeof obj.scroll_stopper === 'string' ? obj.scroll_stopper : undefined,
    curiosity_gap: typeof obj.curiosity_gap === 'string' ? obj.curiosity_gap : undefined,
    monetization: obj.monetization && typeof obj.monetization === 'object'
      ? obj.monetization as IdeaContext['monetization']
      : undefined,
    repurpose_potential: obj.repurpose_potential && typeof obj.repurpose_potential === 'object'
      ? obj.repurpose_potential as IdeaContext['repurpose_potential']
      : undefined,
  };
}

export async function loadIdeaContext(ideaId: string): Promise<IdeaContext | null> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from('idea_archives')
    .select('id, title, core_tension, target_audience, discovery_data, tags')
    .eq('id', ideaId)
    .maybeSingle();

  if (error || !data) return null;

  const discovery = parseDiscoveryData(data.discovery_data);

  return {
    id: data.id,
    title: data.title,
    core_tension: data.core_tension,
    target_audience: data.target_audience,
    tags: data.tags ?? undefined,
    ...discovery,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/src/lib/ai/__tests__/loadIdeaContext.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/ai/loadIdeaContext.ts apps/api/src/lib/ai/__tests__/loadIdeaContext.test.ts
git commit -m "feat(api): add loadIdeaContext utility to fetch idea data with parsed discovery_data"
```

---

### Task 2: Update production.ts builders — remove YAML, add idea context

**Files:**
- Modify: `apps/api/src/lib/ai/prompts/production.ts`
- Modify: `apps/api/src/lib/ai/__tests__/prompts-production.test.ts`

- [ ] **Step 1: Update tests to cover new behavior**

```typescript
// apps/api/src/lib/ai/__tests__/prompts-production.test.ts
import { describe, it, expect } from 'vitest';
import { buildCanonicalCoreMessage, buildProduceMessage, buildReproduceMessage } from '../prompts/production.js';
import type { IdeaContext } from '../loadIdeaContext.js';

const mockIdea: IdeaContext = {
  id: 'uuid-123',
  title: 'Test Idea',
  core_tension: 'Old way vs new way',
  target_audience: 'Developers',
  scroll_stopper: 'Did you know 73% fail?',
  curiosity_gap: 'The one thing nobody tells you',
  monetization: { affiliate_angle: 'CRM tools' },
};

describe('buildCanonicalCoreMessage', () => {
  it('includes title and type', () => {
    const msg = buildCanonicalCoreMessage({
      type: 'blog',
      title: 'AI Ethics Deep Dive',
      ideaId: 'uuid-123',
    });
    expect(msg).toContain('AI Ethics Deep Dive');
    expect(msg).toContain('blog');
    expect(msg).toContain('canonical core');
  });

  it('includes research cards as JSON (not YAML)', () => {
    const msg = buildCanonicalCoreMessage({
      type: 'video',
      title: 'test',
      researchCards: [{ title: 'Finding 1', summary: 'Important data' }],
    });
    expect(msg).toContain('"title": "Finding 1"');
    expect(msg).toContain('"summary": "Important data"');
  });

  it('includes idea context when provided', () => {
    const msg = buildCanonicalCoreMessage({
      type: 'blog',
      title: 'test',
      idea: mockIdea,
    });
    expect(msg).toContain('Selected idea:');
    expect(msg).toContain('"core_tension": "Old way vs new way"');
    expect(msg).toContain('"scroll_stopper": "Did you know 73% fail?"');
  });

  it('includes production params as JSON (not YAML)', () => {
    const msg = buildCanonicalCoreMessage({
      type: 'blog',
      title: 'test',
      productionParams: { target_word_count: 1000 },
    });
    expect(msg).toContain('"target_word_count": 1000');
  });
});

describe('buildProduceMessage', () => {
  it('includes canonical core reference', () => {
    const msg = buildProduceMessage({
      type: 'blog',
      title: 'test',
      canonicalCore: { thesis: 'AI changes everything' },
    });
    expect(msg).toContain('blog');
    expect(msg).toContain('AI changes everything');
  });

  it('includes idea context when provided', () => {
    const msg = buildProduceMessage({
      type: 'blog',
      title: 'test',
      canonicalCore: { thesis: 'test' },
      idea: mockIdea,
    });
    expect(msg).toContain('Original idea context:');
    expect(msg).toContain('"target_audience": "Developers"');
  });
});

describe('buildReproduceMessage', () => {
  it('includes review feedback', () => {
    const msg = buildReproduceMessage({
      type: 'blog',
      title: 'test',
      reviewFeedback: {
        overall_verdict: 'revision_required',
        critical_issues: ['Missing sources'],
      },
    });
    expect(msg).toContain('Missing sources');
    expect(msg).toContain('revision_required');
  });

  it('includes strengths', () => {
    const msg = buildReproduceMessage({
      type: 'video',
      title: 'test',
      reviewFeedback: {
        strengths: ['Great hook', 'Solid research'],
      },
    });
    expect(msg).toContain('Great hook');
    expect(msg).toContain('Solid research');
  });

  it('includes idea context when provided', () => {
    const msg = buildReproduceMessage({
      type: 'blog',
      title: 'test',
      reviewFeedback: { overall_verdict: 'revision_required' },
      idea: mockIdea,
    });
    expect(msg).toContain('Original idea context:');
    expect(msg).toContain('"curiosity_gap"');
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `npx vitest run apps/api/src/lib/ai/__tests__/prompts-production.test.ts`
Expected: FAIL — new tests about JSON format and idea context fail

- [ ] **Step 3: Update production.ts**

Replace the entire file `apps/api/src/lib/ai/prompts/production.ts` with:

```typescript
import type { IdeaContext } from '../loadIdeaContext.js';

export interface CanonicalCoreInput {
  type: string;
  title: string;
  ideaId?: string;
  idea?: IdeaContext | null;
  researchCards?: unknown[];
  productionParams?: unknown;
  channel?: { name?: string; niche?: string; language?: string; tone?: string };
}

export interface ProduceInput {
  type: string;
  title: string;
  canonicalCore: unknown;
  idea?: IdeaContext | null;
  productionParams?: unknown;
  channel?: { name?: string; niche?: string; language?: string; tone?: string };
}

export interface ReproduceInput {
  type: string;
  title: string;
  canonicalCore?: unknown;
  previousDraft?: unknown;
  idea?: IdeaContext | null;
  reviewFeedback: {
    overall_verdict?: string;
    score?: number | null;
    critical_issues?: string[];
    minor_issues?: string[];
    strengths?: string[];
  };
  channel?: { name?: string; niche?: string; language?: string; tone?: string };
}

function channelBlock(ch?: { name?: string; niche?: string; language?: string; tone?: string }): string {
  if (!ch) return '';
  const parts: string[] = [];
  if (ch.name) parts.push(`Channel: ${ch.name}`);
  if (ch.language) parts.push(`Language: ${ch.language}`);
  if (ch.niche) parts.push(`Niche: ${ch.niche}`);
  if (ch.tone) parts.push(`Tone: ${ch.tone}`);
  return parts.length > 0 ? '\n' + parts.join('\n') : '';
}

function jsonBlock(data: unknown): string {
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

export function buildCanonicalCoreMessage(input: CanonicalCoreInput): string {
  const lines: string[] = [];
  lines.push(`Generate a canonical core for a ${input.type} content piece.`);
  lines.push(`Title: "${input.title}"`);
  if (input.ideaId) lines.push(`Idea ID: ${input.ideaId}`);

  if (input.idea) {
    lines.push('');
    lines.push('Selected idea:');
    lines.push(jsonBlock(input.idea));
  }

  if (input.researchCards && Array.isArray(input.researchCards) && input.researchCards.length > 0) {
    lines.push('');
    lines.push('Approved research cards:');
    lines.push(jsonBlock(input.researchCards));
  }

  if (input.productionParams) {
    lines.push('');
    lines.push('Production parameters:');
    lines.push(jsonBlock(input.productionParams));
  }

  lines.push(channelBlock(input.channel));
  lines.push('');
  lines.push('Respond with a JSON object matching the output contract. No markdown, no commentary.');
  return lines.join('\n');
}

export function buildProduceMessage(input: ProduceInput): string {
  const lines: string[] = [];
  lines.push(`Produce a ${input.type} draft from the canonical core below.`);
  lines.push(`Title: "${input.title}"`);

  if (input.idea) {
    lines.push('');
    lines.push('Original idea context:');
    lines.push(jsonBlock(input.idea));
  }

  lines.push('');
  lines.push('Canonical core:');
  lines.push(jsonBlock(input.canonicalCore));

  if (input.productionParams) {
    lines.push('');
    lines.push('Production parameters:');
    lines.push(jsonBlock(input.productionParams));
  }

  lines.push(channelBlock(input.channel));
  lines.push('');
  lines.push('Respond with a JSON object matching the output contract. No markdown, no commentary.');
  return lines.join('\n');
}

export function buildReproduceMessage(input: ReproduceInput): string {
  const lines: string[] = [];
  lines.push(`Revise the ${input.type} draft based on review feedback.`);
  lines.push(`Title: "${input.title}"`);
  lines.push('');
  lines.push(`Review verdict: ${input.reviewFeedback.overall_verdict ?? 'unknown'}`);
  if (input.reviewFeedback.score != null) lines.push(`Score: ${input.reviewFeedback.score}`);
  if (input.reviewFeedback.critical_issues?.length) {
    lines.push('');
    lines.push('Critical issues to fix:');
    input.reviewFeedback.critical_issues.forEach((i) => lines.push(`- ${i}`));
  }
  if (input.reviewFeedback.minor_issues?.length) {
    lines.push('');
    lines.push('Minor issues to fix:');
    input.reviewFeedback.minor_issues.forEach((i) => lines.push(`- ${i}`));
  }
  if (input.reviewFeedback.strengths?.length) {
    lines.push('');
    lines.push('Strengths to keep:');
    input.reviewFeedback.strengths.forEach((s) => lines.push(`- ${s}`));
  }

  if (input.idea) {
    lines.push('');
    lines.push('Original idea context:');
    lines.push(jsonBlock(input.idea));
  }

  if (input.canonicalCore) {
    lines.push('');
    lines.push('Canonical core:');
    lines.push(jsonBlock(input.canonicalCore));
  }

  if (input.previousDraft) {
    lines.push('');
    lines.push('Previous draft:');
    lines.push(jsonBlock(input.previousDraft));
  }

  lines.push(channelBlock(input.channel));
  lines.push('');
  lines.push('Fix the issues, keep the strengths. Respond with a JSON object matching the output contract. No markdown, no commentary.');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run apps/api/src/lib/ai/__tests__/prompts-production.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Verify js-yaml is no longer imported**

Run: `grep -r "js-yaml" apps/api/src/lib/ai/prompts/production.ts`
Expected: No output (import removed)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/ai/prompts/production.ts apps/api/src/lib/ai/__tests__/prompts-production.test.ts
git commit -m "feat(api): switch production builders from YAML to JSON, add idea context support"
```

---

### Task 3: Update review.ts types

**Files:**
- Modify: `apps/api/src/lib/ai/prompts/review.ts`

- [ ] **Step 1: Update the `ReviewInput` interface type**

In `apps/api/src/lib/ai/prompts/review.ts`, change line 6:

```typescript
// Before:
  idea?: unknown;

// After:
  idea?: IdeaContext | null;
```

And add the import at the top of the file:

```typescript
import type { IdeaContext } from '../loadIdeaContext.js';
```

- [ ] **Step 2: Run existing review tests to verify nothing breaks**

Run: `npx vitest run apps/api/src/lib/ai/__tests__/prompts-review.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/ai/prompts/review.ts
git commit -m "refactor(api): type review builder idea param as IdeaContext"
```

---

### Task 4: Wire loadIdeaContext into content-drafts routes

**Files:**
- Modify: `apps/api/src/routes/content-drafts.ts`

- [ ] **Step 1: Add import at top of content-drafts.ts**

Add after the existing production/review prompt imports:

```typescript
import { loadIdeaContext } from "../lib/ai/loadIdeaContext.js";
```

- [ ] **Step 2: Update POST /:id/canonical-core endpoint**

Find this block (around line 448):

```typescript
        const userMessage = buildCanonicalCoreMessage({
          type: draft.type as string,
          title: draft.title as string,
          ideaId: draft.idea_id as string | undefined,
          researchCards: approvedCards as unknown[] | undefined,
          channel: channelData as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
        });
```

Add idea loading before it and pass it:

```typescript
        const idea = draft.idea_id
          ? await loadIdeaContext(draft.idea_id as string)
          : null;

        const userMessage = buildCanonicalCoreMessage({
          type: draft.type as string,
          title: draft.title as string,
          ideaId: draft.idea_id as string | undefined,
          idea,
          researchCards: approvedCards as unknown[] | undefined,
          channel: channelData as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
        });
```

- [ ] **Step 3: Add output idea_id overwrite after canonical-core generation**

Find this line (around line 492):

```typescript
          .update({ canonical_core_json: result, status: "draft" })
```

Replace with:

```typescript
          .update({
            canonical_core_json: draft.idea_id && result && typeof result === 'object' && !Array.isArray(result)
              ? { ...(result as Record<string, unknown>), idea_id: draft.idea_id }
              : result,
            status: "draft",
          })
```

- [ ] **Step 4: Update POST /:id/produce endpoint**

Find the `buildProduceMessage` call (around line 639):

```typescript
        const userMessage = buildProduceMessage({
          type: type as string,
          title: draft.title as string,
          canonicalCore: draft.canonical_core_json,
          productionParams: (draft.production_params as Record<string, unknown> | null) ?? undefined,
          channel: channelData as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
        });
```

Add idea loading before it and pass it:

```typescript
        const idea = draft.idea_id
          ? await loadIdeaContext(draft.idea_id as string)
          : null;

        const userMessage = buildProduceMessage({
          type: type as string,
          title: draft.title as string,
          canonicalCore: draft.canonical_core_json,
          idea,
          productionParams: (draft.production_params as Record<string, unknown> | null) ?? undefined,
          channel: channelData as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
        });
```

- [ ] **Step 5: Update POST /:id/review endpoint**

Find the inline idea_archives query (around line 736-743):

```typescript
        let ideaData: unknown = null;
        if (draft.idea_id) {
          const { data: idea } = await sb
            .from("idea_archives")
            .select("*")
            .eq("id", draft.idea_id as string)
            .maybeSingle();
          ideaData = idea;
        }
```

Replace with:

```typescript
        const ideaData = draft.idea_id
          ? await loadIdeaContext(draft.idea_id as string)
          : null;
```

- [ ] **Step 6: Update POST /:id/asset-prompts endpoint**

Find the reply.send call (around line 1056):

```typescript
        return reply.send({
          data: {
            title: (draft.title as string) ?? "Untitled",
            content_type: contentType,
            sections,
            channel_context: channelContext,
          },
          error: null,
        });
```

Add idea loading before it and include in response:

```typescript
        const idea = draft.idea_id
          ? await loadIdeaContext(draft.idea_id as string)
          : null;

        return reply.send({
          data: {
            title: (draft.title as string) ?? "Untitled",
            content_type: contentType,
            sections,
            channel_context: channelContext,
            idea_context: idea,
          },
          error: null,
        });
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no type errors in content-drafts.ts)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/content-drafts.ts
git commit -m "feat(api): wire loadIdeaContext into all content-drafts endpoints"
```

---

### Task 5: Wire loadIdeaContext into production-generate async job

**Files:**
- Modify: `apps/api/src/jobs/production-generate.ts`

- [ ] **Step 1: Add import**

Add after the existing imports:

```typescript
import { loadIdeaContext } from '../lib/ai/loadIdeaContext.js';
```

- [ ] **Step 2: Add idea loading step after load-channel step**

Find the `load-channel` step (around line 82-90). Add a new step after it:

```typescript
      const ideaContext = (await step.run('load-idea', async () => {
        if (!draft.idea_id) return null;
        return await loadIdeaContext(draft.idea_id as string);
      })) as Awaited<ReturnType<typeof loadIdeaContext>>;
```

- [ ] **Step 3: Pass idea to buildCanonicalCoreMessage**

Find the `generate-core` step (around line 101). Update the builder call:

```typescript
        const userMessage = buildCanonicalCoreMessage({
          type: type as string,
          title: draft.title as string,
          ideaId: draft.idea_id as string | undefined,
          idea: ideaContext,
          researchCards: approvedCards as unknown[] | undefined,
          productionParams,
          channel: channelContext as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
        });
```

- [ ] **Step 4: Add idea_id overwrite in save-core step**

Find the `save-core` step (around line 141). Update:

```typescript
      await step.run('save-core', async () => {
        const coreToSave = draft.idea_id && canonicalCore && typeof canonicalCore === 'object' && !Array.isArray(canonicalCore)
          ? { ...(canonicalCore as Record<string, unknown>), idea_id: draft.idea_id }
          : canonicalCore;
        await (sb.from('content_drafts') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        })
          .update({ canonical_core_json: coreToSave })
          .eq('id', draftId);
        await debitCredits(orgId, userId, 'canonical-core', 'text', coreCost, { draftId, type, provider });
      });
```

- [ ] **Step 5: Pass idea to buildProduceMessage**

Find the `generate-produce` step (around line 164). Update:

```typescript
        const userMessage = buildProduceMessage({
          type: type as string,
          title: draft.title as string,
          canonicalCore,
          idea: ideaContext,
          productionParams,
          channel: channelContext as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
        });
```

- [ ] **Step 6: Pass idea to buildReviewMessage in auto-review**

Find the `generate-review` step (around line 229). Update:

```typescript
          const userMessage = buildReviewMessage({
            type: type as string,
            title: draft.title as string,
            draftJson,
            canonicalCore,
            idea: ideaContext,
            channel: channelContext as { name?: string; niche?: string; language?: string; tone?: string } | undefined,
          });
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/jobs/production-generate.ts
git commit -m "feat(api): thread idea context through async production pipeline"
```

---

### Task 6: Run full test suite for Workstream A

**Files:** None (verification only)

- [ ] **Step 1: Run all API tests**

Run: `npm run test:api`
Expected: PASS (all existing + new tests)

- [ ] **Step 2: Run typecheck across all workspaces**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Verify js-yaml is no longer used in production.ts**

Run: `grep -rn "yaml" apps/api/src/lib/ai/prompts/production.ts`
Expected: No output

---

## Workstream B: Structured Agent Prompt Builder

---

### Task 7: Database migration — add sections_json column

**Files:**
- Create: `supabase/migrations/20260417200000_agent_sections_json.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add sections_json to agent_prompts for structured prompt editing.
-- Backward compatible: NULL means the agent uses raw instructions.

ALTER TABLE public.agent_prompts
  ADD COLUMN IF NOT EXISTS sections_json JSONB DEFAULT NULL;

COMMENT ON COLUMN public.agent_prompts.sections_json IS
  'Structured prompt sections. When present, the admin editor assembles instructions from this. NULL = legacy raw instructions.';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260417200000_agent_sections_json.sql
git commit -m "feat(db): add sections_json JSONB column to agent_prompts"
```

---

### Task 8: Extend agents API to accept sections_json

**Files:**
- Modify: `apps/api/src/routes/agents.ts`

- [ ] **Step 1: Update the Zod schema**

In `apps/api/src/routes/agents.ts`, update `updateAgentSchema` (line 12):

```typescript
const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  instructions: z.string().optional(),
  input_schema: z.string().optional(),
  output_schema: z.string().optional(),
  sections_json: z.record(z.unknown()).nullable().optional(),
});
```

- [ ] **Step 2: Verify the GET endpoint returns sections_json**

In the GET `/` endpoint (line 29), add `sections_json` to the select:

```typescript
      const { data: agents, error } = await sb
        .from('agent_prompts')
        .select('id, name, slug, stage, instructions, input_schema, output_schema, sections_json, created_at, updated_at')
        .order('stage', { ascending: true });
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/agents.ts
git commit -m "feat(api): extend agents PUT to accept sections_json"
```

---

### Task 9: Create assembleInstructions utility

**Files:**
- Create: `apps/web/src/lib/agents/types.ts`
- Create: `apps/web/src/lib/agents/assembleInstructions.ts`
- Create: `apps/web/src/lib/agents/__tests__/assembleInstructions.test.ts`

- [ ] **Step 1: Create the types file**

```typescript
// apps/web/src/lib/agents/types.ts

export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
  items?: {
    type?: 'string' | 'number' | 'boolean' | 'object';
    fields?: SchemaField[];
  };
  fields?: SchemaField[];
}

export interface PromptSchema {
  name: string;
  fields: SchemaField[];
}

export interface CustomSection {
  title: string;
  content: string;
}

export interface SectionsJson {
  header: {
    role: string;
    context: string;
    principles: string[];
    purpose: string[];
  };
  inputSchema: PromptSchema;
  outputSchema: PromptSchema;
  rules: {
    formatting: string[];
    content: string[];
    validation: string[];
  };
  customSections: CustomSection[];
}
```

- [ ] **Step 2: Write the test file**

```typescript
// apps/web/src/lib/agents/__tests__/assembleInstructions.test.ts
import { describe, it, expect } from 'vitest';
import { assembleInstructions, buildSchemaExample } from '../assembleInstructions';
import type { SectionsJson, SchemaField } from '../types';

describe('buildSchemaExample', () => {
  it('builds a flat JSON example from fields', () => {
    const fields: SchemaField[] = [
      { name: 'idea_id', type: 'string', required: true, description: 'UUID of the idea' },
      { name: 'score', type: 'number', required: false, description: 'Quality score' },
    ];
    const result = buildSchemaExample(fields);
    const parsed = JSON.parse(result);
    expect(parsed.idea_id).toBe('');
    expect(parsed.score).toBe(0);
  });

  it('builds nested object fields', () => {
    const fields: SchemaField[] = [
      {
        name: 'monetization',
        type: 'object',
        required: true,
        description: 'Money stuff',
        fields: [
          { name: 'affiliate_angle', type: 'string', required: true, description: '' },
        ],
      },
    ];
    const result = buildSchemaExample(fields);
    const parsed = JSON.parse(result);
    expect(parsed.monetization.affiliate_angle).toBe('');
  });

  it('builds array of objects', () => {
    const fields: SchemaField[] = [
      {
        name: 'steps',
        type: 'array',
        required: true,
        description: 'Steps',
        items: {
          type: 'object',
          fields: [
            { name: 'claim', type: 'string', required: true, description: '' },
          ],
        },
      },
    ];
    const result = buildSchemaExample(fields);
    const parsed = JSON.parse(result);
    expect(parsed.steps).toEqual([{ claim: '' }]);
  });

  it('builds array of primitives', () => {
    const fields: SchemaField[] = [
      { name: 'tags', type: 'array', required: true, description: 'Tags', items: { type: 'string' } },
    ];
    const result = buildSchemaExample(fields);
    const parsed = JSON.parse(result);
    expect(parsed.tags).toEqual(['']);
  });
});

describe('assembleInstructions', () => {
  const minimal: SectionsJson = {
    header: {
      role: 'You are a test agent.',
      context: 'Testing context.',
      principles: ['Be accurate'],
      purpose: ['Generate test output'],
    },
    inputSchema: {
      name: 'BC_TEST_INPUT',
      fields: [
        { name: 'title', type: 'string', required: true, description: 'The title' },
      ],
    },
    outputSchema: {
      name: 'BC_TEST_OUTPUT',
      fields: [
        { name: 'result', type: 'string', required: true, description: 'The result' },
      ],
    },
    rules: {
      formatting: ['Output must be valid JSON'],
      content: ['Be concise'],
      validation: ['Verify result is non-empty'],
    },
    customSections: [],
  };

  it('assembles a complete prompt', () => {
    const result = assembleInstructions(minimal);
    expect(result).toContain('You are a test agent.');
    expect(result).toContain('Testing context.');
    expect(result).toContain('Be accurate');
    expect(result).toContain('Generate test output');
    expect(result).toContain('## Input Schema (BC_TEST_INPUT)');
    expect(result).toContain('"title": ""');
    expect(result).toContain('## Output Schema (BC_TEST_OUTPUT)');
    expect(result).toContain('## Rules');
    expect(result).toContain('Output must be valid JSON');
    expect(result).toContain('Be concise');
    expect(result).toContain('Verify result is non-empty');
  });

  it('includes custom sections', () => {
    const withCustom = {
      ...minimal,
      customSections: [{ title: 'Target Length', content: 'Keep it under 1000 words.' }],
    };
    const result = assembleInstructions(withCustom);
    expect(result).toContain('## Target Length');
    expect(result).toContain('Keep it under 1000 words.');
  });

  it('ends with JSON output instruction', () => {
    const result = assembleInstructions(minimal);
    expect(result).toContain('Output must be valid JSON. No markdown fences, no commentary.');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run apps/web/src/lib/agents/__tests__/assembleInstructions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Write the implementation**

```typescript
// apps/web/src/lib/agents/assembleInstructions.ts
import type { SectionsJson, SchemaField } from './types';

function defaultValue(type: SchemaField['type']): unknown {
  switch (type) {
    case 'string': return '';
    case 'number': return 0;
    case 'boolean': return false;
    case 'array': return [];
    case 'object': return {};
  }
}

function buildFieldExample(field: SchemaField): unknown {
  if (field.type === 'object' && field.fields?.length) {
    const obj: Record<string, unknown> = {};
    for (const f of field.fields) {
      obj[f.name] = buildFieldExample(f);
    }
    return obj;
  }
  if (field.type === 'array') {
    if (field.items?.type === 'object' && field.items.fields?.length) {
      const obj: Record<string, unknown> = {};
      for (const f of field.items.fields) {
        obj[f.name] = buildFieldExample(f);
      }
      return [obj];
    }
    if (field.items?.type) {
      return [defaultValue(field.items.type)];
    }
    return [];
  }
  return defaultValue(field.type);
}

export function buildSchemaExample(fields: SchemaField[]): string {
  const obj: Record<string, unknown> = {};
  for (const field of fields) {
    obj[field.name] = buildFieldExample(field);
  }
  return JSON.stringify(obj, null, 2);
}

export function assembleInstructions(sections: SectionsJson): string {
  const lines: string[] = [];

  // 1. Header
  lines.push(`<context>`);
  lines.push(sections.header.context);
  lines.push('');
  lines.push(`<role>`);
  lines.push(sections.header.role);
  lines.push('');
  lines.push(`<guiding principles>`);
  for (const p of sections.header.principles) {
    lines.push(`- ${p}`);
  }
  lines.push('');
  lines.push(`<specific for the agent purpose>`);
  for (const p of sections.header.purpose) {
    lines.push(`- ${p}`);
  }

  // 2. Input Schema
  if (sections.inputSchema.fields.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`## Input Schema (${sections.inputSchema.name})`);
    lines.push('');
    lines.push('```json');
    lines.push(buildSchemaExample(sections.inputSchema.fields));
    lines.push('```');
  }

  // 3. Output Schema
  if (sections.outputSchema.fields.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`## Output Schema (${sections.outputSchema.name})`);
    lines.push('');
    lines.push('```json');
    lines.push(buildSchemaExample(sections.outputSchema.fields));
    lines.push('```');
  }

  // 4. Rules
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Rules');
  if (sections.rules.formatting.length > 0) {
    lines.push('');
    lines.push('**JSON Formatting:**');
    lines.push('');
    for (const r of sections.rules.formatting) {
      lines.push(`- ${r}`);
    }
  }
  if (sections.rules.content.length > 0) {
    lines.push('');
    lines.push('**Content Rules:**');
    lines.push('');
    for (const r of sections.rules.content) {
      lines.push(`- ${r}`);
    }
  }
  if (sections.rules.validation.length > 0) {
    lines.push('');
    lines.push(`**Before finishing:** ${sections.rules.validation.join(' ')}`);
  }

  // 5. Custom Sections
  for (const section of sections.customSections) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`## ${section.title}`);
    lines.push('');
    lines.push(section.content);
  }

  // 6. Footer
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('Output must be valid JSON. No markdown fences, no commentary.');

  return lines.join('\n');
}
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `npx vitest run apps/web/src/lib/agents/__tests__/assembleInstructions.test.ts`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/agents/types.ts apps/web/src/lib/agents/assembleInstructions.ts apps/web/src/lib/agents/__tests__/assembleInstructions.test.ts
git commit -m "feat(web): add assembleInstructions utility with schema example builder"
```

---

### Task 10: Update admin server action to support sections_json

**Files:**
- Modify: `apps/web/src/app/zadmin/(protected)/agents/[slug]/actions.ts`

- [ ] **Step 1: Update the payload interface and action**

Replace the entire file:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_INTERNAL } from '@/lib/admin-path';

interface UpdatePayload {
  id: string;
  name: string;
  instructions: string;
  input_schema: string | null;
  output_schema: string | null;
  recommended_provider: string | null;
  recommended_model: string | null;
  sections_json: Record<string, unknown> | null;
}

export async function updateAgentAction(payload: UpdatePayload) {
  const db = createAdminClient();
  const { error } = await db
    .from('agent_prompts')
    .update({
      name: payload.name,
      instructions: payload.instructions,
      input_schema: payload.input_schema,
      output_schema: payload.output_schema,
      recommended_provider: payload.recommended_provider,
      recommended_model: payload.recommended_model,
      sections_json: payload.sections_json,
    })
    .eq('id', payload.id);

  if (error) return { ok: false as const, message: error.message };
  revalidatePath(`${ADMIN_INTERNAL}/agents`);
  revalidatePath(`${ADMIN_INTERNAL}/agents/${payload.id}`);
  return { ok: true as const };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/zadmin/(protected)/agents/[slug]/actions.ts
git commit -m "feat(web): admin action accepts sections_json on agent save"
```

---

### Task 11: Update agent page to load sections_json

**Files:**
- Modify: `apps/web/src/app/zadmin/(protected)/agents/[slug]/page.tsx`

- [ ] **Step 1: Add sections_json to the select query**

Update the select string (line 12):

```typescript
    .select('id, name, slug, stage, instructions, input_schema, output_schema, sections_json, recommended_provider, recommended_model, updated_at')
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/zadmin/(protected)/agents/[slug]/page.tsx
git commit -m "feat(web): load sections_json in agent edit page"
```

---

### Task 12: Build the structured editor shell with tabs

**Files:**
- Modify: `apps/web/src/app/zadmin/(protected)/agents/[slug]/editor.tsx`

- [ ] **Step 1: Rewrite the editor component with tab navigation**

Replace the entire `apps/web/src/app/zadmin/(protected)/agents/[slug]/editor.tsx` file with:

```tsx
'use client';

import { useState, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { adminPath } from '@/lib/admin-path';
import { updateAgentAction } from './actions';
import { assembleInstructions } from '@/lib/agents/assembleInstructions';
import type { SectionsJson } from '@/lib/agents/types';

interface Agent {
  id: string;
  name: string;
  slug: string;
  stage: string;
  instructions: string;
  input_schema: string | null;
  output_schema: string | null;
  sections_json: SectionsJson | null;
  recommended_provider: string | null;
  recommended_model: string | null;
  updated_at: string;
}

const TABS = ['Header', 'Input Schema', 'Output Schema', 'Rules', 'Custom Sections', 'Preview', 'Settings'] as const;
type Tab = typeof TABS[number];

const PROVIDER_OPTIONS = [
  { value: '', label: '-- no recommendation --' },
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
];

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'o1-mini'],
  anthropic: ['claude-sonnet-4-5-20250514', 'claude-opus-4-5-20250514', 'claude-haiku-4-5-20251001'],
};

function emptySections(): SectionsJson {
  return {
    header: { role: '', context: '', principles: [], purpose: [] },
    inputSchema: { name: '', fields: [] },
    outputSchema: { name: '', fields: [] },
    rules: { formatting: [], content: [], validation: [] },
    customSections: [],
  };
}

export function AgentEditor({ agent }: { agent: Agent }) {
  const [activeTab, setActiveTab] = useState<Tab>('Header');
  const [name, setName] = useState(agent.name);
  const [sections, setSections] = useState<SectionsJson>(agent.sections_json ?? emptySections());
  const [provider, setProvider] = useState(agent.recommended_provider ?? '');
  const [model, setModel] = useState(agent.recommended_model ?? '');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [showImportBanner] = useState(!agent.sections_json);

  const preview = useMemo(() => {
    try {
      return assembleInstructions(sections);
    } catch {
      return '(Error assembling preview)';
    }
  }, [sections]);

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const assembled = assembleInstructions(sections);
      const res = await updateAgentAction({
        id: agent.id,
        name,
        instructions: assembled,
        input_schema: null,
        output_schema: null,
        recommended_provider: provider || null,
        recommended_model: model || null,
        sections_json: sections,
      });
      if (res.ok) {
        setMessage({ kind: 'ok', text: 'Saved. Changes reflect on next generation (5min cache).' });
      } else {
        setMessage({ kind: 'err', text: res.message });
      }
    });
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href={adminPath('/agents')} className="text-xs text-muted-foreground hover:underline">
            &larr; Back to Agents
          </Link>
          <h1 className="text-2xl font-bold mt-1">{agent.name}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span className="font-mono">{agent.slug}</span>
            <span>&middot;</span>
            <span>{agent.stage}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <span className={`text-xs ${message.kind === 'ok' ? 'text-green-600' : 'text-destructive'}`}>
              {message.text}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={pending}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {pending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {showImportBanner && (
        <div className="mb-4 p-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 text-sm">
          This agent uses raw instructions. The structured editor starts empty. You can manually fill each section.
        </div>
      )}

      <div className="flex gap-6">
        {/* Tab sidebar */}
        <nav className="w-44 shrink-0 space-y-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm ${
                activeTab === tab
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'Header' && (
            <HeaderTab sections={sections} onChange={setSections} name={name} onNameChange={setName} />
          )}
          {activeTab === 'Input Schema' && (
            <div className="text-sm text-muted-foreground p-8 border rounded-md text-center">
              Schema builder coming in next task.
            </div>
          )}
          {activeTab === 'Output Schema' && (
            <div className="text-sm text-muted-foreground p-8 border rounded-md text-center">
              Schema builder coming in next task.
            </div>
          )}
          {activeTab === 'Rules' && (
            <RulesTab sections={sections} onChange={setSections} />
          )}
          {activeTab === 'Custom Sections' && (
            <CustomSectionsTab sections={sections} onChange={setSections} />
          )}
          {activeTab === 'Preview' && (
            <PreviewTab preview={preview} />
          )}
          {activeTab === 'Settings' && (
            <SettingsTab
              slug={agent.slug}
              stage={agent.stage}
              provider={provider}
              model={model}
              onProviderChange={setProvider}
              onModelChange={setModel}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Header Tab ──────────────────────────────────────────────────── */

function HeaderTab({
  sections,
  onChange,
  name,
  onNameChange,
}: {
  sections: SectionsJson;
  onChange: (s: SectionsJson) => void;
  name: string;
  onNameChange: (n: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Agent Name</label>
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="w-full px-3 py-2 rounded-md border bg-background text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Role</label>
        <textarea
          value={sections.header.role}
          onChange={(e) => onChange({ ...sections, header: { ...sections.header, role: e.target.value } })}
          rows={3}
          className="w-full px-3 py-2 rounded-md border bg-background text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Context</label>
        <textarea
          value={sections.header.context}
          onChange={(e) => onChange({ ...sections, header: { ...sections.header, context: e.target.value } })}
          rows={3}
          className="w-full px-3 py-2 rounded-md border bg-background text-sm"
        />
      </div>
      <ListEditor
        label="Guiding Principles"
        items={sections.header.principles}
        onChange={(principles) => onChange({ ...sections, header: { ...sections.header, principles } })}
      />
      <ListEditor
        label="Agent Purpose"
        items={sections.header.purpose}
        onChange={(purpose) => onChange({ ...sections, header: { ...sections.header, purpose } })}
      />
    </div>
  );
}

/* ─── Rules Tab ───────────────────────────────────────────────────── */

function RulesTab({ sections, onChange }: { sections: SectionsJson; onChange: (s: SectionsJson) => void }) {
  return (
    <div className="space-y-6">
      <ListEditor
        label="JSON Formatting Rules"
        items={sections.rules.formatting}
        onChange={(formatting) => onChange({ ...sections, rules: { ...sections.rules, formatting } })}
      />
      <ListEditor
        label="Content Rules"
        items={sections.rules.content}
        onChange={(content) => onChange({ ...sections, rules: { ...sections.rules, content } })}
      />
      <ListEditor
        label="Validation Checks (Before finishing)"
        items={sections.rules.validation}
        onChange={(validation) => onChange({ ...sections, rules: { ...sections.rules, validation } })}
      />
    </div>
  );
}

/* ─── Custom Sections Tab ─────────────────────────────────────────── */

function CustomSectionsTab({ sections, onChange }: { sections: SectionsJson; onChange: (s: SectionsJson) => void }) {
  function addSection() {
    onChange({
      ...sections,
      customSections: [...sections.customSections, { title: '', content: '' }],
    });
  }

  function updateSection(index: number, field: 'title' | 'content', value: string) {
    const updated = [...sections.customSections];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...sections, customSections: updated });
  }

  function removeSection(index: number) {
    onChange({
      ...sections,
      customSections: sections.customSections.filter((_, i) => i !== index),
    });
  }

  return (
    <div className="space-y-4">
      {sections.customSections.map((section, i) => (
        <div key={i} className="p-4 border rounded-md space-y-3">
          <div className="flex items-center justify-between">
            <input
              value={section.title}
              onChange={(e) => updateSection(i, 'title', e.target.value)}
              placeholder="Section title"
              className="px-2 py-1 rounded border bg-background text-sm font-medium flex-1 mr-2"
            />
            <button
              onClick={() => removeSection(i)}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
          <textarea
            value={section.content}
            onChange={(e) => updateSection(i, 'content', e.target.value)}
            rows={6}
            placeholder="Section content (markdown)"
            className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono"
          />
        </div>
      ))}
      <button
        onClick={addSection}
        className="px-3 py-1.5 rounded-md border text-sm hover:bg-muted/50"
      >
        + Add Section
      </button>
    </div>
  );
}

/* ─── Preview Tab ─────────────────────────────────────────────────── */

function PreviewTab({ preview }: { preview: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Assembled Instructions Preview</h3>
        <span className="text-xs text-muted-foreground">{preview.length} chars</span>
      </div>
      <pre className="p-4 rounded-md border bg-muted/30 text-xs font-mono whitespace-pre-wrap max-h-[70vh] overflow-y-auto">
        {preview}
      </pre>
    </div>
  );
}

/* ─── Settings Tab ────────────────────────────────────────────────── */

function SettingsTab({
  slug,
  stage,
  provider,
  model,
  onProviderChange,
  onModelChange,
}: {
  slug: string;
  stage: string;
  provider: string;
  model: string;
  onProviderChange: (v: string) => void;
  onModelChange: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Slug</label>
          <input value={slug} disabled className="w-full px-3 py-2 rounded-md border bg-muted text-sm opacity-60" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Stage</label>
          <input value={stage} disabled className="w-full px-3 py-2 rounded-md border bg-muted text-sm opacity-60" />
        </div>
      </div>
      <div className="space-y-3 p-4 rounded-md border bg-muted/20">
        <h3 className="text-sm font-medium">Recommended Model</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Provider</label>
            <select
              value={provider}
              onChange={(e) => { onProviderChange(e.target.value); onModelChange(''); }}
              className="w-full px-2 py-1.5 rounded-md border bg-background text-sm"
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Model</label>
            <input
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={!provider}
              list={`models-${provider}`}
              placeholder={provider ? 'e.g. gemini-2.5-flash' : 'choose provider first'}
              className="w-full px-2 py-1.5 rounded-md border bg-background text-sm disabled:opacity-50"
            />
            {provider && MODEL_SUGGESTIONS[provider] && (
              <datalist id={`models-${provider}`}>
                {MODEL_SUGGESTIONS[provider].map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Shared: List Editor ─────────────────────────────────────────── */

function ListEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={item}
            onChange={(e) => {
              const updated = [...items];
              updated[i] = e.target.value;
              onChange(updated);
            }}
            className="flex-1 px-3 py-1.5 rounded-md border bg-background text-sm"
          />
          <button
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="text-xs text-destructive hover:underline shrink-0"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...items, ''])}
        className="px-3 py-1.5 rounded-md border text-sm hover:bg-muted/50"
      >
        + Add
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Start dev server and verify the editor loads**

Run: `npm run dev:web`
Navigate to the admin panel, click any agent. Verify:
- Tab navigation works (Header, Rules, Custom Sections, Preview, Settings)
- Header tab shows text fields
- Preview tab shows assembled output
- Save button works

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/zadmin/(protected)/agents/[slug]/editor.tsx
git commit -m "feat(web): structured agent editor with tabs, header, rules, custom sections, preview"
```

---

### Task 13: Build SchemaBuilder component

**Files:**
- Create: `apps/web/src/components/agents/SchemaBuilder.tsx`

- [ ] **Step 1: Create the schema builder component**

```tsx
// apps/web/src/components/agents/SchemaBuilder.tsx
'use client';

import { useState } from 'react';
import type { SchemaField, PromptSchema } from '@/lib/agents/types';
import { buildSchemaExample } from '@/lib/agents/assembleInstructions';

const FIELD_TYPES: SchemaField['type'][] = ['string', 'number', 'boolean', 'array', 'object'];
const ITEMS_TYPES = ['string', 'number', 'boolean', 'object'] as const;

interface SchemaBuilderProps {
  schema: PromptSchema;
  onChange: (schema: PromptSchema) => void;
}

export function SchemaBuilder({ schema, onChange }: SchemaBuilderProps) {
  const preview = buildSchemaExample(schema.fields);

  return (
    <div className="flex gap-6">
      {/* Fields editor */}
      <div className="flex-1 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Schema Name</label>
          <input
            value={schema.name}
            onChange={(e) => onChange({ ...schema, name: e.target.value })}
            placeholder="e.g. BC_BLOG_INPUT"
            className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono"
          />
        </div>

        <FieldList
          fields={schema.fields}
          onChange={(fields) => onChange({ ...schema, fields })}
          depth={0}
        />
      </div>

      {/* Live preview */}
      <div className="w-80 shrink-0">
        <div className="sticky top-4">
          <h4 className="text-sm font-medium mb-2">JSON Preview</h4>
          <pre className="p-3 rounded-md border bg-muted/30 text-xs font-mono whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
            {preview}
          </pre>
        </div>
      </div>
    </div>
  );
}

function FieldList({
  fields,
  onChange,
  depth,
}: {
  fields: SchemaField[];
  onChange: (fields: SchemaField[]) => void;
  depth: number;
}) {
  function addField() {
    onChange([
      ...fields,
      { name: '', type: 'string', required: false, description: '' },
    ]);
  }

  function updateField(index: number, updated: SchemaField) {
    const next = [...fields];
    next[index] = updated;
    onChange(next);
  }

  function removeField(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {fields.map((field, i) => (
        <FieldRow
          key={i}
          field={field}
          onChange={(f) => updateField(i, f)}
          onRemove={() => removeField(i)}
          onMoveUp={() => moveField(i, -1)}
          onMoveDown={() => moveField(i, 1)}
          isFirst={i === 0}
          isLast={i === fields.length - 1}
          depth={depth}
        />
      ))}
      {depth < 3 && (
        <button
          onClick={addField}
          className="px-3 py-1.5 rounded-md border text-sm hover:bg-muted/50"
        >
          + Add field
        </button>
      )}
    </div>
  );
}

function FieldRow({
  field,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  depth,
}: {
  field: SchemaField;
  onChange: (f: SchemaField) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = (field.type === 'array' && field.items?.type === 'object') || field.type === 'object';

  return (
    <div className={`border rounded-md ${depth > 0 ? 'ml-6 border-dashed' : ''}`}>
      {/* Collapsed header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {hasChildren && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-muted-foreground">
            {expanded ? '▼' : '▶'}
          </button>
        )}
        <input
          value={field.name}
          onChange={(e) => onChange({ ...field, name: e.target.value })}
          placeholder="field_name"
          className="w-36 px-2 py-1 rounded border bg-background text-sm font-mono"
        />
        <select
          value={field.type}
          onChange={(e) => {
            const type = e.target.value as SchemaField['type'];
            const updated: SchemaField = { ...field, type };
            if (type === 'object' && !updated.fields) updated.fields = [];
            if (type === 'array' && !updated.items) updated.items = { type: 'string' };
            if (type !== 'object') delete updated.fields;
            if (type !== 'array') delete updated.items;
            onChange(updated);
          }}
          className="w-24 px-2 py-1 rounded border bg-background text-sm"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ ...field, required: e.target.checked })}
          />
          req
        </label>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={onMoveUp} disabled={isFirst} className="text-xs px-1 disabled:opacity-30">&uarr;</button>
          <button onClick={onMoveDown} disabled={isLast} className="text-xs px-1 disabled:opacity-30">&darr;</button>
          <button onClick={onRemove} className="text-xs text-destructive px-1">&#x2715;</button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <input
            value={field.description}
            onChange={(e) => onChange({ ...field, description: e.target.value })}
            placeholder="Description"
            className="w-full px-2 py-1 rounded border bg-background text-xs"
          />

          {field.type === 'array' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Items type:</span>
                <select
                  value={field.items?.type ?? 'string'}
                  onChange={(e) => {
                    const itemType = e.target.value as typeof ITEMS_TYPES[number];
                    const items = itemType === 'object'
                      ? { type: itemType as const, fields: field.items?.fields ?? [] }
                      : { type: itemType as const };
                    onChange({ ...field, items });
                  }}
                  className="px-2 py-1 rounded border bg-background text-xs"
                >
                  {ITEMS_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {field.items?.type === 'object' && depth < 2 && (
                <FieldList
                  fields={field.items.fields ?? []}
                  onChange={(fields) => onChange({ ...field, items: { ...field.items, type: 'object', fields } })}
                  depth={depth + 1}
                />
              )}
            </div>
          )}

          {field.type === 'object' && depth < 2 && (
            <FieldList
              fields={field.fields ?? []}
              onChange={(fields) => onChange({ ...field, fields })}
              depth={depth + 1}
            />
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire SchemaBuilder into the editor tabs**

In `apps/web/src/app/zadmin/(protected)/agents/[slug]/editor.tsx`, replace the two placeholder divs for Input Schema and Output Schema:

```tsx
// Replace the Input Schema placeholder:
{activeTab === 'Input Schema' && (
  <SchemaBuilder
    schema={sections.inputSchema}
    onChange={(inputSchema) => setSections({ ...sections, inputSchema })}
  />
)}

// Replace the Output Schema placeholder:
{activeTab === 'Output Schema' && (
  <SchemaBuilder
    schema={sections.outputSchema}
    onChange={(outputSchema) => setSections({ ...sections, outputSchema })}
  />
)}
```

Add the import at the top:

```tsx
import { SchemaBuilder } from '@/components/agents/SchemaBuilder';
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Test in browser**

Run: `npm run dev:web`
Navigate to any agent edit page. Click "Input Schema" tab. Verify:
- Schema name input shows
- Can add fields with name, type, required, description
- Array type shows items type selector
- Object type shows nested field list
- Live JSON preview updates on right side
- Up/down arrows reorder fields

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/agents/SchemaBuilder.tsx apps/web/src/app/zadmin/(protected)/agents/[slug]/editor.tsx
git commit -m "feat(web): schema builder component with nested fields, reorder, live preview"
```

---

### Task 14: Run full test suite and final verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npm run test`
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Verify dev server**

Run: `npm run dev`
Verify:
- API starts on port 3001
- App starts on port 3000
- Web/admin starts on port 3002
- Agent editor loads with structured form
- Preview tab shows assembled instructions
- Save works end-to-end

- [ ] **Step 4: Final commit if any loose changes**

```bash
git status
# If clean, skip. Otherwise commit any remaining changes.
```
