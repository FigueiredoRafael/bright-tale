# Arquitetura

## Comunicação entre Apps

```
Browser → apps/app (middleware injeta X-Internal-Key)
              ↓ rewrite /api/*
         apps/api (valida X-Internal-Key, usa service_role)
              ↓
         Supabase (PostgreSQL, RLS deny-all)
```

### apps/app (UI)
- Next.js 16 com App Router
- Middleware em `src/middleware.ts`:
  - Strip de `x-internal-key` e `x-user-id` do browser (anti-spoofing)
  - Injeta `X-Internal-Key` de `process.env.INTERNAL_API_KEY`
  - Adiciona `x-request-id` para tracing
  - Rewrite de `/api/*` para `apps/api`

### apps/api (API)
- Next.js Route Handlers
- Middleware em `src/middleware/authenticate.ts`:
  - Valida `X-Internal-Key` em todas as rotas `/api/*`
  - Usa `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS)
- Todas as respostas: `{ data: T | null, error: { code, message } | null }`

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
