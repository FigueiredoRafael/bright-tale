# Arquitetura

## Comunicação entre Apps

```
Browser → apps/app (Next.js middleware injeta X-Internal-Key)
              ↓ rewrite /api/*
         apps/api (Fastify — valida X-Internal-Key, usa service_role)
              ↓
         Supabase (PostgreSQL, RLS deny-all)     Inngest (event queue)
                                                      ↑
                                              Jobs assíncronos
                                              (brainstorm/research/production)
```

### apps/app (UI final do usuário)
- Next.js 16 com App Router, React 19
- Middleware em `src/middleware.ts`:
  - Strip de `x-internal-key` e `x-user-id` do browser (anti-spoofing)
  - Injeta `X-Internal-Key` de `process.env.INTERNAL_API_KEY`
  - Adiciona `x-request-id` pra tracing
  - Rewrite de `/api/*` pra `apps/api` (porta 3001)
- Shadcn/ui + Tailwind 4

### apps/api (API backend)
- **Fastify** (não Next.js Route Handlers — migrou pra Fastify pra ter Inngest handler + fastify-raw-body pra Stripe)
- Middleware em `src/middleware/authenticate.ts`:
  - Valida `X-Internal-Key` em todas as rotas
  - Usa `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS)
- Todas as respostas: `{ data: T | null, error: { code, message } | null }`

### apps/web (admin + landing)
- Admin: edição de `agent_prompts`, `channels` config, pipeline orgchart (F2-032)
- Landing: página pública com pricing (F3-010)

### packages/shared
- Consumido em source level (sem build)
- `transpilePackages` no `next.config.ts`
- Contém: tipos, schemas Zod, mappers snake_case ↔ camelCase

### Inngest (jobs async)
- **Dev:** `npx inngest-cli@latest dev --no-discovery -u http://localhost:3001/inngest` sobe um dev server local na porta 8288
- **Prod:** Inngest Cloud
- Funções registradas em `apps/api/src/jobs/`: `brainstormGenerate`, `researchGenerate`, `productionGenerate`, `contentGenerate` (legacy)
- Ver [Pipeline assíncrono](/architecture/pipeline) pro fluxo detalhado

### packages/shared
- Consumido em source level (sem build)
- `transpilePackages` no `next.config.ts`
- Contém: tipos, schemas Zod, mappers snake_case ↔ camelCase

## API Response Envelope

Todas as respostas seguem:

```json
// Sucesso
{ "data": { ... }, "error": null }

// Erro
{ "data": null, "error": { "code": "NOT_FOUND", "message": "Project not found" } }
```

Helpers: `ok(res, data)` e `fail(res, statusCode, { code, message })`.

## Path Aliases

| Alias | Resolve para |
|---|---|
| `@/*` | `./src/*` (em cada app) |
| `@brighttale/shared` | `../../packages/shared/src` |

## Idempotência

Requests sensíveis usam `idempotency_keys`:
- Token único por request
- TTL: 1 hora
- Armazena request_hash + response para retry safety
