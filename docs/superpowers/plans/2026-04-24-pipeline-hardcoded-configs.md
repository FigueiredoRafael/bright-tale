# Pipeline Hardcoded Configs — Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair valores hardcoded críticos do pipeline (score thresholds, custos de crédito, providers padrão) para duas tabelas globais singleton administráveis via admin panel.

**Architecture:** Duas tabelas Supabase singleton (`pipeline_settings`, `credit_settings`) com upsert via `lock_key = 'global'`. API admin com GET aberto/PATCH restrito a admin. PipelineOrchestrator busca ambas as tabelas ao montar e injeta nas engines via props. API `content-drafts.ts` busca `credit_settings` via helper server-side.

**Tech Stack:** Next.js 16 App Router, Fastify (apps/api), Supabase, Zod, shadcn/ui, TypeScript, Vitest

---

## File Map

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| CREATE | `supabase/migrations/20260424100000_pipeline_settings.sql` | Tabela + seed singleton |
| CREATE | `supabase/migrations/20260424100001_credit_settings.sql` | Tabela + seed singleton |
| CREATE | `packages/shared/src/schemas/pipeline-settings.ts` | Zod schemas para ambas as tabelas |
| MODIFY | `packages/shared/src/schemas/index.ts` | Exportar novos schemas |
| MODIFY | `apps/app/src/components/engines/types.ts` | Adicionar `PipelineSettings`, `CreditSettings`, defaults |
| CREATE | `apps/api/src/lib/credit-settings.ts` | Helper server-side para carregar credit_settings |
| CREATE | `apps/api/src/routes/admin-pipeline-settings.ts` | GET + PATCH /admin/pipeline-settings |
| CREATE | `apps/api/src/routes/admin-credit-settings.ts` | GET + PATCH /admin/credit-settings |
| MODIFY | `apps/api/src/index.ts` | Registrar as duas rotas |
| MODIFY | `apps/api/src/routes/content-drafts.ts` | Substituir FORMAT_COSTS hardcoded pelo helper |
| MODIFY | `apps/app/src/components/pipeline/PipelineOrchestrator.tsx` | Buscar settings, passar para engines, substituir `< 40` hardcode |
| MODIFY | `apps/app/src/components/engines/DraftEngine.tsx` | Receber `creditSettings` prop, derivar TYPES dinamicamente |
| MODIFY | `apps/app/src/components/engines/ReviewEngine.tsx` | Receber `pipelineSettings` prop, substituir `>= 90` hardcode |
| CREATE | `apps/app/src/app/[locale]/(app)/settings/agents/pipeline/page.tsx` | Settings page — pipeline behavior |
| CREATE | `apps/app/src/app/[locale]/(app)/settings/billing/credits/page.tsx` | Settings page — credit costs |
| CREATE | `packages/shared/src/schemas/__tests__/admin-settings.test.ts` | Unit tests dos schemas |

---

## Task 1: Migrations — tabelas singleton

**Files:**
- Create: `supabase/migrations/20260424100000_pipeline_settings.sql`
- Create: `supabase/migrations/20260424100001_credit_settings.sql`

- [ ] **Step 1: Criar migration pipeline_settings**

```sql
-- supabase/migrations/20260424100000_pipeline_settings.sql
CREATE TABLE public.pipeline_settings (
  id                        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_key                  TEXT    UNIQUE NOT NULL DEFAULT 'global',
  review_reject_threshold   INT     NOT NULL DEFAULT 40,
  review_approve_score      INT     NOT NULL DEFAULT 90,
  review_max_iterations     INT     NOT NULL DEFAULT 5,
  default_providers_json    JSONB   NOT NULL DEFAULT '{"brainstorm":"gemini","research":"gemini","draft":"gemini","review":"gemini"}',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.pipeline_settings
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE public.pipeline_settings ENABLE ROW LEVEL SECURITY;

-- Seed singleton
INSERT INTO public.pipeline_settings (lock_key) VALUES ('global');
```

- [ ] **Step 2: Criar migration credit_settings**

```sql
-- supabase/migrations/20260424100001_credit_settings.sql
CREATE TABLE public.credit_settings (
  id                  UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_key            TEXT  UNIQUE NOT NULL DEFAULT 'global',
  cost_blog           INT   NOT NULL DEFAULT 200,
  cost_video          INT   NOT NULL DEFAULT 200,
  cost_shorts         INT   NOT NULL DEFAULT 100,
  cost_podcast        INT   NOT NULL DEFAULT 150,
  cost_canonical_core INT   NOT NULL DEFAULT 80,
  cost_review         INT   NOT NULL DEFAULT 20,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.credit_settings
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE public.credit_settings ENABLE ROW LEVEL SECURITY;

-- Seed singleton
INSERT INTO public.credit_settings (lock_key) VALUES ('global');
```

- [ ] **Step 3: Aplicar migrations e regenerar tipos**

```bash
npm run db:push:dev
npm run db:types
```

Esperado: sem erros. `packages/shared/src/types/database.ts` passa a incluir `pipeline_settings` e `credit_settings`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260424100000_pipeline_settings.sql \
        supabase/migrations/20260424100001_credit_settings.sql \
        packages/shared/src/types/database.ts
git commit -m "feat(db): add pipeline_settings and credit_settings singleton tables"
```

---

## Task 2: Schemas Zod em @brighttale/shared

**Files:**
- Create: `packages/shared/src/schemas/pipeline-settings.ts`
- Modify: `packages/shared/src/schemas/index.ts`

- [ ] **Step 1: Escrever os testes primeiro**

Criar `packages/shared/src/schemas/__tests__/admin-settings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  updatePipelineSettingsSchema,
  updateCreditSettingsSchema,
  pipelineSettingsResponseSchema,
  creditSettingsResponseSchema,
} from '../pipeline-settings';

describe('updatePipelineSettingsSchema', () => {
  it('accepts valid partial update', () => {
    const result = updatePipelineSettingsSchema.safeParse({ reviewRejectThreshold: 35 });
    expect(result.success).toBe(true);
  });

  it('rejects score outside 0–100', () => {
    const result = updatePipelineSettingsSchema.safeParse({ reviewApproveScore: 150 });
    expect(result.success).toBe(false);
  });

  it('rejects negative iterations', () => {
    const result = updatePipelineSettingsSchema.safeParse({ reviewMaxIterations: -1 });
    expect(result.success).toBe(false);
  });
});

describe('updateCreditSettingsSchema', () => {
  it('accepts valid partial update', () => {
    const result = updateCreditSettingsSchema.safeParse({ costBlog: 300 });
    expect(result.success).toBe(true);
  });

  it('rejects negative cost', () => {
    const result = updateCreditSettingsSchema.safeParse({ costBlog: -10 });
    expect(result.success).toBe(false);
  });
});

describe('pipelineSettingsResponseSchema', () => {
  it('parses complete row', () => {
    const result = pipelineSettingsResponseSchema.safeParse({
      reviewRejectThreshold: 40,
      reviewApproveScore: 90,
      reviewMaxIterations: 5,
      defaultProviders: { brainstorm: 'gemini', research: 'gemini', draft: 'gemini', review: 'gemini' },
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar — verificar falha**

```bash
npx vitest run packages/shared/src/schemas/__tests__/admin-settings.test.ts
```

Esperado: FAIL — `cannot find module '../pipeline-settings'`

- [ ] **Step 3: Criar o arquivo de schemas**

```typescript
// packages/shared/src/schemas/pipeline-settings.ts
import { z } from 'zod';

export const updatePipelineSettingsSchema = z.object({
  reviewRejectThreshold: z.number().int().min(0).max(100).optional(),
  reviewApproveScore:    z.number().int().min(0).max(100).optional(),
  reviewMaxIterations:   z.number().int().min(1).max(20).optional(),
  defaultProviders: z.object({
    brainstorm: z.string().optional(),
    research:   z.string().optional(),
    draft:      z.string().optional(),
    review:     z.string().optional(),
  }).optional(),
});
export type UpdatePipelineSettingsInput = z.infer<typeof updatePipelineSettingsSchema>;

export const pipelineSettingsResponseSchema = z.object({
  reviewRejectThreshold: z.number(),
  reviewApproveScore:    z.number(),
  reviewMaxIterations:   z.number(),
  defaultProviders:      z.record(z.string()),
});
export type PipelineSettingsResponse = z.infer<typeof pipelineSettingsResponseSchema>;

export const updateCreditSettingsSchema = z.object({
  costBlog:          z.number().int().min(0).optional(),
  costVideo:         z.number().int().min(0).optional(),
  costShorts:        z.number().int().min(0).optional(),
  costPodcast:       z.number().int().min(0).optional(),
  costCanonicalCore: z.number().int().min(0).optional(),
  costReview:        z.number().int().min(0).optional(),
});
export type UpdateCreditSettingsInput = z.infer<typeof updateCreditSettingsSchema>;

export const creditSettingsResponseSchema = z.object({
  costBlog:          z.number(),
  costVideo:         z.number(),
  costShorts:        z.number(),
  costPodcast:       z.number(),
  costCanonicalCore: z.number(),
  costReview:        z.number(),
});
export type CreditSettingsResponse = z.infer<typeof creditSettingsResponseSchema>;
```

- [ ] **Step 4: Rodar — verificar passa**

```bash
npx vitest run packages/shared/src/schemas/__tests__/admin-settings.test.ts
```

Esperado: PASS (4 testes)

- [ ] **Step 5: Exportar em index.ts**

Adicionar ao final de `packages/shared/src/schemas/index.ts`:

```typescript
// Admin Settings schemas
export {
  updatePipelineSettingsSchema,
  pipelineSettingsResponseSchema,
  updateCreditSettingsSchema,
  creditSettingsResponseSchema,
  type UpdatePipelineSettingsInput,
  type PipelineSettingsResponse,
  type UpdateCreditSettingsInput,
  type CreditSettingsResponse,
} from './pipeline-settings';
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/pipeline-settings.ts \
        packages/shared/src/schemas/index.ts \
        packages/shared/src/schemas/__tests__/admin-settings.test.ts
git commit -m "feat(shared): add pipeline-settings and credit-settings Zod schemas"
```

---

## Task 3: Tipos e defaults nas engines (types.ts)

**Files:**
- Modify: `apps/app/src/components/engines/types.ts`

- [ ] **Step 1: Adicionar interfaces e defaults**

Adicionar ao final de `apps/app/src/components/engines/types.ts` (depois de `DEFAULT_PIPELINE_STATE`):

```typescript
export interface PipelineSettings {
  reviewRejectThreshold: number;
  reviewApproveScore: number;
  reviewMaxIterations: number;
  defaultProviders: Record<string, string>;
}

export const DEFAULT_PIPELINE_SETTINGS: PipelineSettings = {
  reviewRejectThreshold: 40,
  reviewApproveScore: 90,
  reviewMaxIterations: 5,
  defaultProviders: {
    brainstorm: 'gemini',
    research: 'gemini',
    draft: 'gemini',
    review: 'gemini',
  },
};

export interface CreditSettings {
  costBlog: number;
  costVideo: number;
  costShorts: number;
  costPodcast: number;
  costCanonicalCore: number;
  costReview: number;
}

export const DEFAULT_CREDIT_SETTINGS: CreditSettings = {
  costBlog: 200,
  costVideo: 200,
  costShorts: 100,
  costPodcast: 150,
  costCanonicalCore: 80,
  costReview: 20,
};
```

- [ ] **Step 2: Substituir literais em DEFAULT_PIPELINE_STATE**

Localizar em `apps/app/src/components/engines/types.ts:148-156` e substituir:

```typescript
// ANTES:
export const DEFAULT_PIPELINE_STATE: PipelineState = {
  mode: 'step-by-step',
  currentStage: 'brainstorm',
  stageResults: {},
  autoConfig: {
    maxReviewIterations: 5,
    targetScore: 90,
  },
};

// DEPOIS:
export const DEFAULT_PIPELINE_STATE: PipelineState = {
  mode: 'step-by-step',
  currentStage: 'brainstorm',
  stageResults: {},
  autoConfig: {
    maxReviewIterations: DEFAULT_PIPELINE_SETTINGS.reviewMaxIterations,
    targetScore: DEFAULT_PIPELINE_SETTINGS.reviewApproveScore,
  },
};
```

**Nota:** `DEFAULT_PIPELINE_SETTINGS` deve estar declarado antes de `DEFAULT_PIPELINE_STATE` no arquivo. Mover se necessário.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Esperado: sem erros

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/engines/types.ts
git commit -m "feat(app): add PipelineSettings and CreditSettings types with defaults"
```

---

## Task 4: Helper server-side — loadCreditSettings

**Files:**
- Create: `apps/api/src/lib/credit-settings.ts`

- [ ] **Step 1: Criar o helper**

```typescript
// apps/api/src/lib/credit-settings.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CreditSettingsRecord {
  costBlog: number;
  costVideo: number;
  costShorts: number;
  costPodcast: number;
  costCanonicalCore: number;
  costReview: number;
}

const DEFAULTS: CreditSettingsRecord = {
  costBlog: 200,
  costVideo: 200,
  costShorts: 100,
  costPodcast: 150,
  costCanonicalCore: 80,
  costReview: 20,
};

export async function loadCreditSettings(sb: SupabaseClient): Promise<CreditSettingsRecord> {
  const { data } = await sb
    .from('credit_settings')
    .select('cost_blog, cost_video, cost_shorts, cost_podcast, cost_canonical_core, cost_review')
    .maybeSingle();

  if (!data) return DEFAULTS;

  return {
    costBlog:          data.cost_blog          ?? DEFAULTS.costBlog,
    costVideo:         data.cost_video         ?? DEFAULTS.costVideo,
    costShorts:        data.cost_shorts        ?? DEFAULTS.costShorts,
    costPodcast:       data.cost_podcast       ?? DEFAULTS.costPodcast,
    costCanonicalCore: data.cost_canonical_core ?? DEFAULTS.costCanonicalCore,
    costReview:        data.cost_review        ?? DEFAULTS.costReview,
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Esperado: sem erros

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/credit-settings.ts
git commit -m "feat(api): add loadCreditSettings helper"
```

---

## Task 5: Rotas API — admin-pipeline-settings e admin-credit-settings

**Files:**
- Create: `apps/api/src/routes/admin-pipeline-settings.ts`
- Create: `apps/api/src/routes/admin-credit-settings.ts`

- [ ] **Step 1: Criar rota pipeline-settings**

```typescript
// apps/api/src/routes/admin-pipeline-settings.ts
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { ApiError } from '../lib/api/errors.js';
import { updatePipelineSettingsSchema } from '@brighttale/shared/schemas/pipeline-settings';

async function assertAdmin(request: any, reply: any, sb: ReturnType<typeof createServiceClient>) {
  if (!request.userId) {
    return reply.status(401).send({ data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
  }
  const { data: role } = await sb
    .from('user_roles')
    .select('role')
    .eq('user_id', request.userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (!role) {
    return reply.status(403).send({ data: null, error: { code: 'FORBIDDEN', message: 'Admin role required' } });
  }
  return null;
}

const DEFAULTS = {
  review_reject_threshold: 40,
  review_approve_score: 90,
  review_max_iterations: 5,
  default_providers_json: { brainstorm: 'gemini', research: 'gemini', draft: 'gemini', review: 'gemini' },
};

function mapRow(row: Record<string, unknown>) {
  return {
    reviewRejectThreshold: row.review_reject_threshold ?? DEFAULTS.review_reject_threshold,
    reviewApproveScore:    row.review_approve_score    ?? DEFAULTS.review_approve_score,
    reviewMaxIterations:   row.review_max_iterations   ?? DEFAULTS.review_max_iterations,
    defaultProviders:      row.default_providers_json  ?? DEFAULTS.default_providers_json,
  };
}

export async function adminPipelineSettingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET / — qualquer usuário autenticado pode ler
  app.get('/', async (req, reply) => {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from('pipeline_settings')
      .select('*')
      .maybeSingle();
    if (error) throw new ApiError(500, error.message, 'PIPELINE_SETTINGS_FETCH_ERROR');
    return reply.send({ data: mapRow((data ?? {}) as Record<string, unknown>), error: null });
  });

  // PATCH / — admin only
  app.patch('/', async (req, reply) => {
    const sb = createServiceClient();
    const denied = await assertAdmin(req, reply, sb);
    if (denied) return;

    const body = updatePipelineSettingsSchema.parse(req.body);

    const update: Record<string, unknown> = {};
    if (body.reviewRejectThreshold !== undefined) update.review_reject_threshold = body.reviewRejectThreshold;
    if (body.reviewApproveScore !== undefined)    update.review_approve_score    = body.reviewApproveScore;
    if (body.reviewMaxIterations !== undefined)   update.review_max_iterations   = body.reviewMaxIterations;
    if (body.defaultProviders !== undefined)      update.default_providers_json  = body.defaultProviders;

    const { data, error } = await sb
      .from('pipeline_settings')
      .update(update)
      .eq('lock_key', 'global')
      .select()
      .single();

    if (error) throw new ApiError(500, error.message, 'PIPELINE_SETTINGS_UPDATE_ERROR');
    if (!data) throw new ApiError(404, 'Pipeline settings not found', 'PIPELINE_SETTINGS_NOT_FOUND');

    return reply.send({ data: mapRow(data as Record<string, unknown>), error: null });
  });
}
```

- [ ] **Step 2: Criar rota credit-settings**

```typescript
// apps/api/src/routes/admin-credit-settings.ts
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { ApiError } from '../lib/api/errors.js';
import { updateCreditSettingsSchema } from '@brighttale/shared/schemas/pipeline-settings';

async function assertAdmin(request: any, reply: any, sb: ReturnType<typeof createServiceClient>) {
  if (!request.userId) {
    return reply.status(401).send({ data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
  }
  const { data: role } = await sb
    .from('user_roles')
    .select('role')
    .eq('user_id', request.userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (!role) {
    return reply.status(403).send({ data: null, error: { code: 'FORBIDDEN', message: 'Admin role required' } });
  }
  return null;
}

const DEFAULTS = {
  cost_blog: 200, cost_video: 200, cost_shorts: 100,
  cost_podcast: 150, cost_canonical_core: 80, cost_review: 20,
};

function mapRow(row: Record<string, unknown>) {
  return {
    costBlog:          row.cost_blog          ?? DEFAULTS.cost_blog,
    costVideo:         row.cost_video         ?? DEFAULTS.cost_video,
    costShorts:        row.cost_shorts        ?? DEFAULTS.cost_shorts,
    costPodcast:       row.cost_podcast       ?? DEFAULTS.cost_podcast,
    costCanonicalCore: row.cost_canonical_core ?? DEFAULTS.cost_canonical_core,
    costReview:        row.cost_review        ?? DEFAULTS.cost_review,
  };
}

export async function adminCreditSettingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET / — qualquer usuário autenticado
  app.get('/', async (req, reply) => {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from('credit_settings')
      .select('*')
      .maybeSingle();
    if (error) throw new ApiError(500, error.message, 'CREDIT_SETTINGS_FETCH_ERROR');
    return reply.send({ data: mapRow((data ?? {}) as Record<string, unknown>), error: null });
  });

  // PATCH / — admin only
  app.patch('/', async (req, reply) => {
    const sb = createServiceClient();
    const denied = await assertAdmin(req, reply, sb);
    if (denied) return;

    const body = updateCreditSettingsSchema.parse(req.body);

    const update: Record<string, unknown> = {};
    if (body.costBlog          !== undefined) update.cost_blog          = body.costBlog;
    if (body.costVideo         !== undefined) update.cost_video         = body.costVideo;
    if (body.costShorts        !== undefined) update.cost_shorts        = body.costShorts;
    if (body.costPodcast       !== undefined) update.cost_podcast       = body.costPodcast;
    if (body.costCanonicalCore !== undefined) update.cost_canonical_core = body.costCanonicalCore;
    if (body.costReview        !== undefined) update.cost_review        = body.costReview;

    const { data, error } = await sb
      .from('credit_settings')
      .update(update)
      .eq('lock_key', 'global')
      .select()
      .single();

    if (error) throw new ApiError(500, error.message, 'CREDIT_SETTINGS_UPDATE_ERROR');
    if (!data) throw new ApiError(404, 'Credit settings not found', 'CREDIT_SETTINGS_NOT_FOUND');

    return reply.send({ data: mapRow(data as Record<string, unknown>), error: null });
  });
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Esperado: sem erros

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/admin-pipeline-settings.ts \
        apps/api/src/routes/admin-credit-settings.ts
git commit -m "feat(api): add admin pipeline-settings and credit-settings routes"
```

---

## Task 6: Registrar rotas em index.ts

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Adicionar imports**

Localizar os imports dos admin routes em `apps/api/src/index.ts` (perto da linha 58-59) e adicionar:

```typescript
import { adminPipelineSettingsRoutes } from "./routes/admin-pipeline-settings.js";
import { adminCreditSettingsRoutes } from "./routes/admin-credit-settings.js";
```

- [ ] **Step 2: Registrar com prefix**

Localizar a linha 204 onde estão registrados `adminPersonaGuardrailsRoutes` e `adminPersonaArchetypesRoutes` e adicionar logo após:

```typescript
server.register(adminPipelineSettingsRoutes, { prefix: "/admin/pipeline-settings" });
server.register(adminCreditSettingsRoutes,   { prefix: "/admin/credit-settings" });
```

- [ ] **Step 3: Testar rotas**

```bash
npm run dev:api
```

```bash
curl -s http://localhost:3001/api/admin/pipeline-settings \
  -H "X-Internal-Key: $INTERNAL_API_KEY" | jq .
```

Esperado:
```json
{
  "data": {
    "reviewRejectThreshold": 40,
    "reviewApproveScore": 90,
    "reviewMaxIterations": 5,
    "defaultProviders": { "brainstorm": "gemini", "research": "gemini", "draft": "gemini", "review": "gemini" }
  },
  "error": null
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): register admin pipeline and credit settings routes"
```

---

## Task 7: Substituir FORMAT_COSTS hardcoded em content-drafts.ts

**Files:**
- Modify: `apps/api/src/routes/content-drafts.ts`

- [ ] **Step 1: Adicionar import do helper**

No topo de `apps/api/src/routes/content-drafts.ts`, adicionar:

```typescript
import { loadCreditSettings } from "../lib/credit-settings.js";
```

- [ ] **Step 2: Remover constantes hardcoded**

Localizar e remover as linhas 49-57:

```typescript
// TODO: we got to remove the hardcoded costs and use admin config settings.
const FORMAT_COSTS: Record<string, number> = {
  blog: 200,
  video: 200,
  shorts: 100,
  podcast: 150,
};
const CANONICAL_CORE_COST = 80;
const REVIEW_COST = 20;
```

- [ ] **Step 3: Substituir cada uso**

Há três pontos de uso de `FORMAT_COSTS`, `CANONICAL_CORE_COST` e `REVIEW_COST` nos handlers. Em cada handler que consome esses valores, adicionar no início do handler:

```typescript
const creditSettings = await loadCreditSettings(createServiceClient());
const FORMAT_COSTS: Record<string, number> = {
  blog:    creditSettings.costBlog,
  video:   creditSettings.costVideo,
  shorts:  creditSettings.costShorts,
  podcast: creditSettings.costPodcast,
};
const CANONICAL_CORE_COST = creditSettings.costCanonicalCore;
const REVIEW_COST = creditSettings.costReview;
```

Usar `grep -n "FORMAT_COSTS\|CANONICAL_CORE_COST\|REVIEW_COST" apps/api/src/routes/content-drafts.ts` para localizar todos os pontos antes de editar.

- [ ] **Step 4: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Esperado: sem erros

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/content-drafts.ts \
        apps/api/src/lib/credit-settings.ts
git commit -m "fix(api): load credit costs from DB instead of hardcoded constants"
```

---

## Task 8: PipelineOrchestrator — buscar settings e injetar nas engines

**Files:**
- Modify: `apps/app/src/components/pipeline/PipelineOrchestrator.tsx`

- [ ] **Step 1: Adicionar imports e state**

No topo do arquivo, adicionar aos imports:

```typescript
import {
  DEFAULT_PIPELINE_SETTINGS,
  DEFAULT_CREDIT_SETTINGS,
  type PipelineSettings,
  type CreditSettings,
} from './types';
```

Dentro do componente `PipelineOrchestrator`, adicionar estado após os estados existentes:

```typescript
const [pipelineSettings, setPipelineSettings] = useState<PipelineSettings>(DEFAULT_PIPELINE_SETTINGS);
const [creditSettings, setCreditSettings] = useState<CreditSettings>(DEFAULT_CREDIT_SETTINGS);
```

- [ ] **Step 2: Buscar settings ao montar**

Adicionar `useEffect` após os estados:

```typescript
useEffect(() => {
  (async () => {
    try {
      const [psRes, csRes] = await Promise.all([
        fetch('/api/admin/pipeline-settings'),
        fetch('/api/admin/credit-settings'),
      ]);
      const [ps, cs] = await Promise.all([psRes.json(), csRes.json()]);
      if (ps?.data) setPipelineSettings(ps.data as PipelineSettings);
      if (cs?.data) setCreditSettings(cs.data as CreditSettings);
    } catch {
      // silent — defaults are used
    }
  })();
}, []);
```

- [ ] **Step 3: Substituir `score < 40` hardcoded**

Localizar linha 228:

```typescript
// ANTES:
} else if (reviewResult.score < 40) {

// DEPOIS:
} else if (reviewResult.score < pipelineSettings.reviewRejectThreshold) {
```

- [ ] **Step 4: Seed DEFAULT_PIPELINE_STATE.autoConfig com settings fetched**

Localizar onde `pipelineState` é inicializado. Quando `project.pipeline_state_json` está vazio (novo projeto), inicializar `autoConfig` com os valores fetched:

```typescript
// Onde o estado inicial é construído (buscar por DEFAULT_PIPELINE_STATE):
const initialState: PipelineState = storedState ?? {
  ...DEFAULT_PIPELINE_STATE,
  autoConfig: {
    maxReviewIterations: pipelineSettings.reviewMaxIterations,
    targetScore: pipelineSettings.reviewApproveScore,
  },
};
```

**Nota:** Verificar onde exatamente `DEFAULT_PIPELINE_STATE` é usado no arquivo para aplicar isso no lugar certo.

- [ ] **Step 5: Passar props para DraftEngine e ReviewEngine**

Localizar onde `<DraftEngine` e `<ReviewEngine` são renderizadas e adicionar as props:

```tsx
// DraftEngine
<DraftEngine
  {...existingProps}
  creditSettings={creditSettings}
/>

// ReviewEngine
<ReviewEngine
  {...existingProps}
  pipelineSettings={pipelineSettings}
/>
```

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Esperado: erros de props faltando em DraftEngine e ReviewEngine — serão resolvidos nos próximos tasks.

- [ ] **Step 7: Commit (parcial — typecheck pode falhar aqui, ok)**

```bash
git add apps/app/src/components/pipeline/PipelineOrchestrator.tsx
git commit -m "feat(app): fetch pipeline/credit settings in orchestrator, wire reject threshold"
```

---

## Task 9: DraftEngine — receber creditSettings, derivar TYPES dinamicamente

**Files:**
- Modify: `apps/app/src/components/engines/DraftEngine.tsx`

- [ ] **Step 1: Adicionar prop ao interface**

Localizar a interface `DraftEngineProps` (perto da linha 50-56) e adicionar:

```typescript
import { type CreditSettings, DEFAULT_CREDIT_SETTINGS } from './types';

// Na interface DraftEngineProps:
interface DraftEngineProps extends BaseEngineProps {
  initialDraft?: Record<string, unknown>;
  creditSettings?: CreditSettings;   // ← adicionar
}
```

- [ ] **Step 2: Receber prop no componente**

Localizar a destructuring do componente (linha 67-74) e adicionar:

```typescript
export function DraftEngine({
  mode: engineMode,
  channelId,
  context,
  onComplete,
  initialDraft,
  onStageProgress,
  creditSettings = DEFAULT_CREDIT_SETTINGS,  // ← adicionar com default
}: DraftEngineProps) {
```

- [ ] **Step 3: Substituir TYPES constante por função derivada**

Remover o array `TYPES` da linha 58-63:

```typescript
// REMOVER:
const TYPES: { id: DraftType; label: string; icon: typeof FileText; cost: number }[] = [
  { id: 'blog', label: 'Blog', icon: FileText, cost: 200 },
  { id: 'video', label: 'Video', icon: Video, cost: 200 },
  { id: 'shorts', label: 'Shorts', icon: Zap, cost: 100 },
  { id: 'podcast', label: 'Podcast', icon: Mic, cost: 150 },
];
```

Adicionar dentro do componente (após a destructuring):

```typescript
const TYPES = [
  { id: 'blog'    as DraftType, label: 'Blog',    icon: FileText, cost: creditSettings.costBlog },
  { id: 'video'   as DraftType, label: 'Video',   icon: Video,    cost: creditSettings.costVideo },
  { id: 'shorts'  as DraftType, label: 'Shorts',  icon: Zap,      cost: creditSettings.costShorts },
  { id: 'podcast' as DraftType, label: 'Podcast', icon: Mic,      cost: creditSettings.costPodcast },
];
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Esperado: sem erros no DraftEngine

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/engines/DraftEngine.tsx
git commit -m "feat(app): DraftEngine receives creditSettings prop, derives TYPES dynamically"
```

---

## Task 10: ReviewEngine — receber pipelineSettings, substituir >= 90 hardcoded

**Files:**
- Modify: `apps/app/src/components/engines/ReviewEngine.tsx`

- [ ] **Step 1: Adicionar import e prop**

No topo, adicionar import:

```typescript
import { type PipelineSettings, DEFAULT_PIPELINE_SETTINGS } from './types';
```

Localizar a interface `ReviewEngineProps` e adicionar:

```typescript
interface ReviewEngineProps {
  // ... props existentes ...
  pipelineSettings?: PipelineSettings;   // ← adicionar
}
```

- [ ] **Step 2: Receber prop no componente**

Localizar a destructuring de `ReviewEngine` (linha 59-68) e adicionar:

```typescript
export function ReviewEngine({
  channelId,
  context,
  draftId,
  draft,
  onComplete,
  onBack,
  onDraftUpdated,
  onStageProgress,
  pipelineSettings = DEFAULT_PIPELINE_SETTINGS,  // ← adicionar
}: ReviewEngineProps) {
```

- [ ] **Step 3: Substituir >= 90 hardcoded**

Localizar linha 394-396:

```typescript
// ANTES:
const effectiveVerdict =
  (effectiveScore !== null && effectiveScore >= 90) ? 'approved'
  : ...

// DEPOIS:
const effectiveVerdict =
  (effectiveScore !== null && effectiveScore >= pipelineSettings.reviewApproveScore) ? 'approved'
  : ...
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Esperado: sem erros

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/engines/ReviewEngine.tsx
git commit -m "feat(app): ReviewEngine receives pipelineSettings, uses reviewApproveScore threshold"
```

---

## Task 11: Settings page — Pipeline Behavior

**Files:**
- Create: `apps/app/src/app/[locale]/(app)/settings/agents/pipeline/page.tsx`

- [ ] **Step 1: Criar a página**

```tsx
// apps/app/src/app/[locale]/(app)/settings/agents/pipeline/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, Settings2 } from "lucide-react";
import type { PipelineSettings } from "@/components/engines/types";
import { DEFAULT_PIPELINE_SETTINGS } from "@/components/engines/types";

const PROVIDERS = ["gemini", "openai", "anthropic", "ollama", "manual"];

export default function PipelineSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<PipelineSettings>(DEFAULT_PIPELINE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, meRes] = await Promise.all([
          fetch("/api/admin/pipeline-settings"),
          fetch("/api/users/me"),
        ]);
        const settingsJson = await settingsRes.json();
        const meJson = await meRes.json();
        if (settingsJson?.data) setSettings(settingsJson.data as PipelineSettings);
        if (meJson?.data?.role === "admin") setIsAdmin(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/pipeline-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (json?.error) throw new Error(json.error.message);
      toast({ title: "Saved", description: "Pipeline settings updated." });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings2 className="h-6 w-6" />
            Pipeline Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Comportamento do auto-pilot e providers padrão por stage.
          </p>
        </div>
        {!isAdmin && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            Somente leitura
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comportamento do Auto-pilot</CardTitle>
          <CardDescription>Controla quando o auto-pilot pausa, aprova ou revisita o draft.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Score mínimo para aprovação</Label>
              <Input
                type="number" min={0} max={100}
                value={settings.reviewApproveScore}
                disabled={!isAdmin}
                onChange={(e) => setSettings((s) => ({ ...s, reviewApproveScore: Number(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">Score ≥ valor → approved</p>
            </div>
            <div className="space-y-1.5">
              <Label>Score mínimo para auto-revisão</Label>
              <Input
                type="number" min={0} max={100}
                value={settings.reviewRejectThreshold}
                disabled={!isAdmin}
                onChange={(e) => setSettings((s) => ({ ...s, reviewRejectThreshold: Number(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">Score abaixo → pausa</p>
            </div>
            <div className="space-y-1.5">
              <Label>Máximo de iterações</Label>
              <Input
                type="number" min={1} max={20}
                value={settings.reviewMaxIterations}
                disabled={!isAdmin}
                onChange={(e) => setSettings((s) => ({ ...s, reviewMaxIterations: Number(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">Iterações antes de pausar</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Providers padrão por stage</CardTitle>
          <CardDescription>Usado quando o usuário não fez override explícito.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(['brainstorm', 'research', 'draft', 'review'] as const).map((stage) => (
            <div key={stage} className="flex items-center justify-between">
              <Label className="capitalize">{stage}</Label>
              <Select
                value={settings.defaultProviders[stage] ?? 'gemini'}
                disabled={!isAdmin}
                onValueChange={(v) =>
                  setSettings((s) => ({ ...s, defaultProviders: { ...s.defaultProviders, [stage]: v } }))
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : "Salvar alterações"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Adicionar link na página de Agents**

Em `apps/app/src/app/[locale]/(app)/settings/agents/page.tsx`, adicionar na barra de tabs (após o link de Archetypes):

```tsx
import { SlidersHorizontal } from "lucide-react";

// Na barra de tabs:
<Link
  href={`/${locale}/settings/agents/pipeline`}
  className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border hover:bg-muted transition-colors"
>
  <SlidersHorizontal className="h-4 w-4" />
  Pipeline
</Link>
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Esperado: sem erros

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/app/[locale]/\(app\)/settings/agents/pipeline/page.tsx \
        apps/app/src/app/[locale]/\(app\)/settings/agents/page.tsx
git commit -m "feat(app): add pipeline settings admin page"
```

---

## Task 12: Settings page — Credit Costs

**Files:**
- Create: `apps/app/src/app/[locale]/(app)/settings/billing/credits/page.tsx`

- [ ] **Step 1: Criar a página**

```tsx
// apps/app/src/app/[locale]/(app)/settings/billing/credits/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, Coins } from "lucide-react";
import type { CreditSettings } from "@/components/engines/types";
import { DEFAULT_CREDIT_SETTINGS } from "@/components/engines/types";

const OPERATIONS = [
  { key: 'costCanonicalCore' as keyof CreditSettings, label: 'Geração de canonical core' },
  { key: 'costReview'        as keyof CreditSettings, label: 'Review de draft' },
] as const;

const FORMATS = [
  { key: 'costBlog'    as keyof CreditSettings, label: 'Blog' },
  { key: 'costVideo'   as keyof CreditSettings, label: 'Vídeo' },
  { key: 'costShorts'  as keyof CreditSettings, label: 'Shorts' },
  { key: 'costPodcast' as keyof CreditSettings, label: 'Podcast' },
] as const;

export default function CreditSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<CreditSettings>(DEFAULT_CREDIT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, meRes] = await Promise.all([
          fetch("/api/admin/credit-settings"),
          fetch("/api/users/me"),
        ]);
        const settingsJson = await settingsRes.json();
        const meJson = await meRes.json();
        if (settingsJson?.data) setSettings(settingsJson.data as CreditSettings);
        if (meJson?.data?.role === "admin") setIsAdmin(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/credit-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (json?.error) throw new Error(json.error.message);
      toast({ title: "Saved", description: "Credit settings updated." });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
          <Lock className="h-4 w-4" />
          Acesso restrito a administradores.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Coins className="h-6 w-6" />
          Custo de créditos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alterações afetam imediatamente todos os usuários.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custo por operação</CardTitle>
          <CardDescription>Operações independentes do formato.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {OPERATIONS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label>{label}</Label>
              <Input
                type="number" min={0} className="w-28 text-right"
                value={settings[key]}
                onChange={(e) => setSettings((s) => ({ ...s, [key]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custo por formato</CardTitle>
          <CardDescription>Cobrado na geração de produção.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {FORMATS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label>{label}</Label>
              <Input
                type="number" min={0} className="w-28 text-right"
                value={settings[key]}
                onChange={(e) => setSettings((s) => ({ ...s, [key]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build final**

```bash
npm run typecheck && npm run build
```

Esperado: sem erros

- [ ] **Step 3: Commit final**

```bash
git add apps/app/src/app/[locale]/\(app\)/settings/billing/credits/page.tsx
git commit -m "feat(app): add credit settings admin page"
```

---

## Verificação final

- [ ] Rodar todos os testes

```bash
npm run test
```

Esperado: todos passam. Os novos testes em `admin-settings.test.ts` devem aparecer como PASS.

- [ ] Checklist de hardcodes resolvidos

| Item | Status |
|------|--------|
| `score < 40` em PipelineOrchestrator | ✅ usa `pipelineSettings.reviewRejectThreshold` |
| `>= 90` em ReviewEngine | ✅ usa `pipelineSettings.reviewApproveScore` |
| `maxReviewIterations: 5` em DEFAULT_PIPELINE_STATE | ✅ usa `DEFAULT_PIPELINE_SETTINGS.reviewMaxIterations` |
| `targetScore: 90` em DEFAULT_PIPELINE_STATE | ✅ usa `DEFAULT_PIPELINE_SETTINGS.reviewApproveScore` |
| FORMAT_COSTS hardcoded em DraftEngine | ✅ derivado de `creditSettings` prop |
| FORMAT_COSTS hardcoded em content-drafts.ts | ✅ carregado via `loadCreditSettings()` |
| CANONICAL_CORE_COST / REVIEW_COST em content-drafts.ts | ✅ carregado via `loadCreditSettings()` |
