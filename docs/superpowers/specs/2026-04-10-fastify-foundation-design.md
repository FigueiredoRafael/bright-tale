# Fastify Foundation — Design Spec (SP1)

> **Sub-projeto 1 de 4** da migração do ecossistema `@tn-figueiredo/*` no bright-tale.
> SPs dependentes: SP2 (route migration), SP3 (apps/app auth), SP4 (admin panel).

---

## Goal

Substituir `apps/api` Next.js Route Handlers por um servidor Fastify 4.x standalone,
instalar `@tn-figueiredo/auth-fastify` para auth de usuários SaaS, e adicionar `user_id`
às 13 tabelas de conteúdo do banco — fundação para multi-tenancy real.

---

## Context

### Estado atual

| Componente | Estado |
|------------|--------|
| `apps/api` | Next.js 16 Route Handlers, porta 3001 |
| Auth | `INTERNAL_API_KEY` header em todas as rotas — sem usuários |
| Banco | 18 tabelas Supabase, 0 com `user_id`, RLS enabled sem policies |
| `apps/app` | Chama `apps/api` via rewrites `next.config.ts:12` + `api-client.ts:17` injeta header |
| `apps/web` | Stub (3 arquivos) |

### Por que Fastify

- `@tn-figueiredo/auth-fastify@1.1.0` requer `fastify >=4.0.0` — não há versão Next.js
- Alinha bright-tale com TNG (padrão do ecossistema para futuros apps)
- Compatibilidade verificada: `auth-supabase@1.1.0` peer `@supabase/supabase-js >=2.39.0` ✅
  (bright-tale usa `^2.45.0`)

---

## Architecture

```
apps/api/ (Fastify 4.x — porta 3001)
  src/
    server.ts              ← Fastify instance + plugins registrados
    index.ts               ← entry point: server.listen(3001)
    plugins/
      supabase.ts          ← service_role client como Fastify plugin (decorator)
      cors.ts              ← @fastify/cors config
      cookie.ts            ← @fastify/cookie config
    routes/
      health.ts            ← GET /health → { status: 'ok', timestamp }
      auth.ts              ← delega para @tn-figueiredo/auth-fastify
    lib/                   ← código atual movido sem alteração (zero mudanças)
  package.json             ← remove next/react; adiciona fastify + ecosystem
```

### Pacotes adicionados a `apps/api`

```json
{
  "fastify": "^4.28.1",
  "@fastify/cookie": "^9.4.0",
  "@fastify/cors": "^9.0.1",
  "@tn-figueiredo/auth-fastify": "1.1.0",
  "@tn-figueiredo/auth-supabase": "1.1.0",
  "@tn-figueiredo/auth": "1.2.1"
}
```

### Pacotes removidos de `apps/api`

`next`, `react`, `react-dom`, `server-only`

### Porta e impacto em apps/app

`apps/api` continua em **porta 3001**. `apps/app/next.config.ts:12` reescreve `/api/*`
para `localhost:3001` — sem alteração necessária em SP1. `apps/app` opera normalmente
durante a transição (auth via INTERNAL_API_KEY permanece até SP3).

---

## Auth Flow

`auth-fastify` registra automaticamente as rotas `/auth/*`:

| Rota | Descrição |
|------|-----------|
| `POST /auth/signup` | Cria user Supabase + row em `user_profiles` |
| `POST /auth/signin` | Valida credenciais → JWT em cookie HttpOnly |
| `POST /auth/refresh` | Renova JWT |
| `POST /auth/signout` | Invalida cookie |
| `POST /auth/forgot-password` | Envia email de reset |

Rotas protegidas (SP2+): `auth-fastify` valida cookie → popula `request.user = { id, email }`
→ handler filtra queries com `.eq('user_id', request.user.id)`.

---

## Database Migrations

### Migration A — `user_profiles`

```sql
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.handle_updated_at();
alter table public.user_profiles enable row level security;
```

### Migration B — `user_id` em 13 tabelas

Tabelas que precisam de `user_id` (queried diretamente sem JOIN cascadeado):

**Root tables (criadas diretamente pelo usuário):**
- `research_archives`, `projects`, `idea_archives`, `templates`

**Config por usuário:**
- `wordpress_configs`, `ai_provider_configs`, `image_generator_configs`

**Drafts com FK loose (queried diretamente, confirmado em routes):**
- `blog_drafts`, `video_drafts`, `shorts_drafts`, `podcast_drafts`
- Evidence: `blogs/route.ts:7` — `sb.from('blog_drafts').select(...)` sem JOIN

**Outros com FK loose:**
- `assets`, `canonical_core`

**Excluídos (cascade formal ou sistema):**
- `research_sources` → `ON DELETE CASCADE` de `research_archives`
- `stages` → `ON DELETE CASCADE` de `projects`
- `revisions` → `ON DELETE CASCADE` de `stages`
- `agent_prompts` → config de plataforma (sem dono)
- `idempotency_keys` → sistema global (token único por request)

Para cada uma das 13 tabelas:

```sql
-- Repetir para cada tabela (exemplo: research_archives)
ALTER TABLE public.research_archives
  ADD COLUMN user_id uuid REFERENCES auth.users(id);
CREATE INDEX idx_research_archives_user_id ON public.research_archives(user_id);
```

**Indexes compostos** (queries frequentes com filtro de status):

```sql
CREATE INDEX idx_projects_user_status ON public.projects(user_id, status);
CREATE INDEX idx_blog_drafts_user_status ON public.blog_drafts(user_id, status);
CREATE INDEX idx_video_drafts_user_status ON public.video_drafts(user_id, status);
```

**Defense-in-depth — trigger BEFORE INSERT** (exemplo, repetir nas 13 tabelas):

```sql
CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_research_archives_user_id
  BEFORE INSERT ON public.research_archives
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
-- (repetir para as outras 12 tabelas)
```

> **Nota:** `user_id` é **nullable** na migration. Como o ambiente dev usa `db:reset`
> (apaga tudo), não há dados legados. Em produção futura, uma migration separada adiciona
> `NOT NULL` após backfill. Em dev, criar usuário de teste via Supabase Dashboard após reset.

---

## Export Jobs — Nota Importante

`apps/api/src/lib/exportJobs.ts:12` usa `Map<string, ExportJob>` in-memory. **Sem tabela
no banco — nenhuma migration necessária.** Com Fastify stateful, jobs sobrevivem entre
requests (vantagem vs Next.js serverless).

Recomendação: adicionar cleanup TTL em `server.ts`:

```typescript
// Cleanup jobs mais velhos que 2h (roda a cada 1h)
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 60 * 60 * 1000);
```

---

## Testing Strategy

| Arquivo | Status | O que cobre |
|---------|--------|-------------|
| `src/__tests__/health.test.ts` | novo | `GET /health` → 200 + `{ status: 'ok' }` |
| `src/__tests__/auth.test.ts` | novo | signup cria user + profile row; signin retorna cookie HttpOnly; rota protegida sem cookie → 401; token inválido → 401 |
| `src/lib/__tests__/*.test.ts` (20 arquivos, 222 casos) | sobrevive intacto | Lib não usa Next.js — zero alteração |
| `src/app/api/projects/bulk/__tests__/*.test.ts` (2 arquivos) | quebra → reescrito em SP2 | `NextRequest` → `FastifyRequest` |
| `src/app/api/export/jobs/__tests__/job.test.ts` (1 arquivo) | quebra → reescrito em SP2 | idem |
| `src/app/api/projects/bulk-create/__tests__/route.test.ts` (1 arquivo) | quebra → reescrito em SP2 | idem |

**Baseline SP1:** 2 suites novas (health + auth) passando + 20 lib suites intactas.

---

## Acceptance Criteria

SP1 está **pronto** quando:

- [ ] `GET http://localhost:3001/health` retorna `{ status: 'ok', timestamp: '...' }` com HTTP 200
- [ ] `POST /auth/signup` com email + senha cria user no Supabase Auth + row em `user_profiles`
- [ ] `POST /auth/signin` retorna cookie HttpOnly com JWT válido
- [ ] Rota protegida chamada sem cookie retorna HTTP 401
- [ ] `npm run db:reset` executa sem erros com as 2 novas migrations
- [ ] 20 lib tests passam sem alteração
- [ ] 2 novas suites (health + auth) passam

---

## Sub-projetos Dependentes

| SP | Pré-requisito | O que desbloqueia |
|----|--------------|------------------|
| SP2 | SP1 | Migrar 61 routes Next.js → Fastify, queries com `user_id` |
| SP3 | SP1 | `apps/app` com `auth-nextjs`, remove `INTERNAL_API_KEY` |
| SP4 | SP1 | `apps/web` admin panel com `auth-nextjs` + `@tn-figueiredo/admin` |

---

## Recommendations para Sprints Futuros

1. **SP2 — NOT NULL após reset** — ao migrar as primeiras rotas, promover `user_id` para
   `NOT NULL` com uma migration SP2 (dados de dev recém-criados, sem legado).

2. **SP2 — Index composto por grupo** — além dos indexes de SP1, adicionar `(user_id, created_at DESC)`
   nas tabelas usadas em listagens paginadas (`projects`, `research_archives`).

3. **SP3/SP4 — auth-nextjs version pin** — `@tn-figueiredo/auth-nextjs` deve ser pinado
   em versão exata (sem `^`) conforme política do ecossistema.

4. **Longo prazo — RLS policies** — service_role + manual `user_id` filter é suficiente
   agora. Quando o projeto escalar, adicionar RLS policies como segunda linha de defesa
   (defense-in-depth) sem mudar o código da API.
