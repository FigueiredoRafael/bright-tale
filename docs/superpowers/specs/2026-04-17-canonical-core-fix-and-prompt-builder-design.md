# Canonical Core Fix + Structured Agent Prompt Builder

**Date:** 2026-04-17
**Status:** approved
**Branch:** feat/engine-logs

---

## Problem

The content generation pipeline produces broken output because:

1. **Missing idea context** — `buildCanonicalCoreMessage()` sends only a bare UUID + title to the AI. The agent prompt expects a full `selected_idea` object with `core_tension`, `target_audience`, `scroll_stopper`, `curiosity_gap`, `monetization.affiliate_angle`. The data exists in `idea_archives.discovery_data` but is never loaded.

2. **No idea context in any engine** — only the Review engine loads idea data. Canonical Core, Blog, Video, Shorts, Podcast, and Assets engines all fly blind.

3. **YAML/JSON format mismatch** — DB prompts say "Output YAML only", code parses JSON, MD files say JSON. The AI gets contradictory instructions.

4. **Field naming inconsistencies** — `affiliate_moment` vs `affiliate_context`, `argument_chain` vs `talking_point_seeds`.

5. **Input structure mismatch** — DB prompts define structured `BC_*_INPUT` schemas. Code sends flat plaintext + raw data dumps. The AI never receives data in the expected format.

6. **No tooling to fix prompts safely** — editing 1000+ line prompt strings in a textarea is error-prone. Amendments were appended via SQL migrations, making prompts hard to maintain.

---

## Solution: Two workstreams

### Workstream A: loadIdeaContext fix (code change)

Fix the data flow so all engines receive idea context.

### Workstream B: Structured prompt builder (admin panel feature)

Build a form-based prompt editor so prompts can be maintained section by section, then use it to fix the prompt content (YAML to JSON, field names, input schemas).

These are independent and can be built in parallel. Workstream A is a code fix. Workstream B is a new feature that then enables content fixes.

---

## Workstream A: loadIdeaContext

### New utility: `apps/api/src/lib/ai/loadIdeaContext.ts`

```typescript
interface IdeaContext {
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
```

- Queries `idea_archives` by `id` (UUID PK)
- Selects `id`, `title`, `core_tension`, `target_audience`, `discovery_data`, `tags`
- Parses `discovery_data` JSON for nested fields (`scroll_stopper`, `curiosity_gap`, `monetization`, `repurpose_potential`)
- Returns typed `IdeaContext` or `null`

### Message builder changes: `apps/api/src/lib/ai/prompts/production.ts`

- Remove `js-yaml` import entirely
- All data blocks switch from `yaml.dump()` to `JSON.stringify(x, null, 2)` (research cards, production params, canonical core, previous draft)
- Add `idea?: IdeaContext | null` to `CanonicalCoreInput`, `ProduceInput`, `ReproduceInput`
- Each builder adds idea context as a JSON block when present

### Review builder: `apps/api/src/lib/ai/prompts/review.ts`

- Change `idea` type from `unknown` to `IdeaContext | null`
- No logic change — already dumps idea as JSON

### Route changes: `apps/api/src/routes/content-drafts.ts`

Four endpoints affected:

| Endpoint | Change |
|----------|--------|
| `POST /:id/canonical-core` | Add `loadIdeaContext(draft.idea_id)`, pass to builder |
| `POST /:id/produce` | Add `loadIdeaContext(draft.idea_id)`, pass to builder |
| `POST /:id/review` | Replace inline `SELECT *` with `loadIdeaContext()` |
| `POST /:id/asset-prompts` | Add `loadIdeaContext(draft.idea_id)`, include in response |

### Async job: `apps/api/src/jobs/production-generate.ts`

- Load idea context once at job start
- Thread `IdeaContext` through canonical-core, produce, and review stages

### Output validation

After `generateWithFallback()` returns the canonical core:
- If draft has `idea_id` and output `idea_id` doesn't match, overwrite output's `idea_id` with draft's before saving
- No schema change — `canonicalCoreSchema` stays `z.string().min(1)`

---

## Workstream B: Structured Agent Prompt Builder

### Data model

New column on `agent_prompts`:

```sql
ALTER TABLE public.agent_prompts ADD COLUMN sections_json JSONB DEFAULT NULL;
```

Shape of `sections_json`:

```json
{
  "header": {
    "role": "string — agent role description",
    "context": "string — project/brand context",
    "principles": ["string — guiding principle"],
    "purpose": ["string — specific instruction"]
  },
  "inputSchema": {
    "name": "BC_BLOG_INPUT",
    "fields": [
      {
        "name": "idea_id",
        "type": "string",
        "required": true,
        "description": "UUID of the source idea"
      },
      {
        "name": "argument_chain",
        "type": "array",
        "required": true,
        "description": "Ordered logical chain",
        "items": {
          "fields": [
            { "name": "step", "type": "number", "required": true, "description": "" },
            { "name": "claim", "type": "string", "required": true, "description": "" }
          ]
        }
      }
    ]
  },
  "outputSchema": {
    "name": "BC_BLOG_OUTPUT",
    "fields": []
  },
  "rules": {
    "formatting": ["Output must be valid JSON, parseable by JSON.parse()"],
    "content": ["title must be curiosity-gap or benefit-driven"],
    "validation": ["Verify slug has no uppercase or spaces"]
  },
  "customSections": [
    {
      "title": "Target Length",
      "content": "When production_params.target_word_count is present..."
    }
  ]
}
```

**Backward compatibility:**
- `loadAgentPrompt()` unchanged — reads `instructions` as-is
- Structured editor writes BOTH `sections_json` AND assembled `instructions` on save
- Agents without `sections_json` keep working with raw `instructions`

### Assembly logic

Pure function: `assembleInstructions(sections: SectionsJson): string`

Location: `apps/web/src/lib/agents/assembleInstructions.ts`

Assembly order:

1. **Header** — role, context, principles, purpose (prose format with `<context>`, `<role>`, `<guiding principles>`, `<specific for the agent purpose>` tags)
2. **Input Schema** — `## Input Schema ({name})` + JSON block generated from field definitions
3. **Output Schema** — `## Output Schema ({name})` + JSON block generated from field definitions
4. **Rules** — `## Rules` with subsections: JSON Formatting, Content Rules, Before finishing
5. **Custom Sections** — each as `## {title}` + content
6. **Footer** — auto-injected: "Output must be valid JSON. No markdown fences, no commentary."

Schema blocks are rendered as JSON examples with empty placeholder values (empty strings, empty arrays, zero for numbers) matching the current prompt style. Field descriptions are included as inline comments above each field. Example:

```json
{
  // UUID of the source idea
  "idea_id": "",
  // Ordered logical chain
  "argument_chain": [
    {
      "step": 0,
      "claim": "",
      "evidence": ""
    }
  ]
}
```

Channel context is NOT included — it's injected at runtime by the API.

### Schema builder component

Visual form for building input/output schemas.

**Field properties:**
- Name (text input)
- Type (dropdown: `string`, `number`, `boolean`, `array`, `object`)
- Required (toggle)
- Description (text input)

**Nested types:**
- `array` with string/number/boolean items: no further nesting
- `array` with object items: nested fields list (recursive, max 3 levels)
- `object`: nested fields list directly

**UI per field:** collapsible row showing name + type when collapsed. Up/down arrows for reorder. Delete with confirmation for fields with children.

**Live preview:** right panel showing assembled JSON schema as it would appear in the prompt.

**Import:** "Import from existing agent" dropdown to clone another agent's schema.

### Form layout

Vertical tabs in the agent edit page (`apps/web/src/app/zadmin/(protected)/agents/[slug]/`):

| Tab | Content |
|-----|---------|
| Header | Prose textareas (role, context) + list editors (principles, purpose) |
| Input Schema | Schema builder component |
| Output Schema | Schema builder component |
| Rules | Three list editors: formatting, content, validation |
| Custom Sections | Add/edit/reorder named sections with markdown content |
| Preview | Read-only live preview of assembled `instructions` |
| Settings | Name, slug (read-only), stage, recommended provider/model |

**Save flow:**
1. Validate required fields
2. Build `sections_json` from form state
3. Run `assembleInstructions(sectionsJson)` to produce `instructions`
4. `PUT /api/agents/:slug` with `{ name, instructions, sections_json }`
5. Toast success/error

**Migration path for existing agents:**
- First visit to structured editor for agent without `sections_json` shows banner: "This agent uses raw instructions. Import into structured editor?"
- Import runs a best-effort parser (split on `---` delimiters and `## ` headers)
- User reviews and adjusts before first structured save

### API update

`PUT /api/agents/:slug` — extend to accept optional `sections_json` in request body.

### Output format

Hardcoded JSON. All assembled prompts include "Output must be valid JSON" instruction. No YAML option.

### Amendments handling

Existing amendments (F2-045 through F2-048) are flattened into their parent sections during import. No separate amendments concept in the structured editor. New additions go into Custom Sections.

---

## Build order

### Workstream A (loadIdeaContext)

1. Create `loadIdeaContext()` utility
2. Update `production.ts` builders (remove YAML, add idea, switch to JSON.stringify)
3. Update `review.ts` types
4. Update route callsites in `content-drafts.ts`
5. Update async job `production-generate.ts`
6. Add output idea_id overwrite logic

### Workstream B (prompt builder)

1. Migration: add `sections_json` column
2. API: extend PUT to accept `sections_json`
3. `assembleInstructions()` utility + tests
4. Form layout shell with tabs
5. Header tab
6. Rules tab
7. Schema builder component
8. Input/Output Schema tabs
9. Custom Sections tab
10. Preview tab
11. Import parser
12. Settings tab

### After both workstreams

Use the prompt builder to fix all agent prompts:
- YAML to JSON output format
- Fix field naming (`affiliate_moment` to `affiliate_context` or vice versa)
- Update input schemas to match what code actually sends
- Flatten amendments into main sections
- Add idea context to input schema definitions

---

## Files affected

### Workstream A

| File | Change |
|------|--------|
| `apps/api/src/lib/ai/loadIdeaContext.ts` | New file |
| `apps/api/src/lib/ai/prompts/production.ts` | Remove YAML, add idea, JSON.stringify |
| `apps/api/src/lib/ai/prompts/review.ts` | Type change only |
| `apps/api/src/routes/content-drafts.ts` | 4 endpoints add loadIdeaContext |
| `apps/api/src/jobs/production-generate.ts` | Load idea once, thread through stages |

### Workstream B

| File | Change |
|------|--------|
| `supabase/migrations/YYYYMMDDHHMMSS_agent_sections_json.sql` | New migration |
| `apps/api/src/routes/agents.ts` | Accept sections_json in PUT |
| `apps/web/src/lib/agents/assembleInstructions.ts` | New file |
| `apps/web/src/app/zadmin/(protected)/agents/[slug]/editor.tsx` | Replace with structured form |
| `apps/web/src/components/agents/SchemaBuilder.tsx` | New component |
| `apps/web/src/components/agents/HeaderForm.tsx` | New component |
| `apps/web/src/components/agents/RulesForm.tsx` | New component |
| `apps/web/src/components/agents/CustomSectionsForm.tsx` | New component |
| `apps/web/src/components/agents/PromptPreview.tsx` | New component |
| `apps/web/src/components/agents/ImportParser.tsx` | New component |

---

## Not in scope

- `loadAgentPrompt()` runtime changes
- `apps/app` settings page (stays read-only)
- Prompt versioning/history
- Agent prompt content updates (done manually via the tool after it's built)
