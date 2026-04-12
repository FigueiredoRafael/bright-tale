# Fase 1 — Fundação

**Objetivo:** Auth, organizations, storage e sistema de créditos. Sem isso nada funciona.

**Spec:** `docs/specs/auth-teams.md` + `docs/specs/infrastructure.md`

**Progresso:** 0/12 concluídos

---

## Cards

### F1-001 — Supabase Auth: signup + login
🔲 **Não iniciado**

**Escopo:**
- Configurar Supabase Auth (magic link + Google OAuth)
- Criar página `/auth/login` em `apps/app`
- Criar página `/auth/signup` em `apps/app`
- Middleware protegendo rotas autenticadas
- Redirect para login se não autenticado

**Arquivos:**
- `apps/app/src/app/auth/login/page.tsx`
- `apps/app/src/app/auth/signup/page.tsx`
- `apps/app/src/middleware.ts` (atualizar)
- `apps/api/src/middleware/authenticate.ts` (atualizar para Supabase Auth)

**Critérios de aceite:**
- [ ] Signup com email + magic link funciona
- [ ] Login com Google OAuth funciona
- [ ] Rotas protegidas redirecionam para login
- [ ] Session persiste entre reloads

**Concluído em:** —

---

### F1-002 — Tabela organizations + migration
🔲 **Não iniciado**

**Escopo:**
- Criar migration `organizations`
- Criar migration `org_memberships`
- Criar migration `org_invites`
- RLS policies para cada tabela
- No signup, criar org pessoal automaticamente

**Arquivos:**
- `supabase/migrations/YYYYMMDD_organizations.sql`
- `supabase/migrations/YYYYMMDD_org_memberships.sql`
- `supabase/migrations/YYYYMMDD_org_invites.sql`
- `packages/shared/src/schemas/organizations.ts`
- `packages/shared/src/types/organizations.ts`

**Critérios de aceite:**
- [ ] Migration roda sem erro
- [ ] RLS bloqueia acesso cross-org
- [ ] Signup cria org + membership (owner) automaticamente
- [ ] `npm run db:types` gera tipos corretos

**Concluído em:** —

---

### F1-003 — API: CRUD de organizations
🔲 **Não iniciado**

**Escopo:**
- `GET /api/org` — org atual do usuário
- `PUT /api/org` — atualizar nome/logo
- `DELETE /api/org` — deletar (owner only)
- Zod schemas para validação

**Critérios de aceite:**
- [ ] Todas as rotas usam envelope `{ data, error }`
- [ ] Permissões por role funcionam
- [ ] Owner pode deletar, admin/member não

**Concluído em:** —

---

### F1-004 — API: Team management (membros + convites)
🔲 **Não iniciado**

**Escopo:**
- `GET /api/org/members` — listar membros
- `POST /api/org/invites` — convidar por email
- `POST /api/org/invites/:token/accept` — aceitar convite
- `PATCH /api/org/members/:userId/role` — mudar role
- `DELETE /api/org/members/:userId` — remover membro
- Enviar email de convite (magic link)

**Critérios de aceite:**
- [ ] Convite envia email com link
- [ ] Link cria conta (se não existe) e vincula à org
- [ ] Owner pode mudar roles, admin não
- [ ] Member removido perde acesso imediato

**Concluído em:** —

---

### F1-005 — UI: Settings > Team
🔲 **Não iniciado**

**Escopo:**
- Página `/settings/team` com lista de membros
- Modal de convite (email + role)
- Ações: mudar role, remover membro
- Badge de role em cada membro

**Critérios de aceite:**
- [ ] Lista membros com role e status (ativo/pendente)
- [ ] Modal de convite funciona
- [ ] Ações respeitam permissões do role atual

**Concluído em:** —

---

### F1-006 — Adicionar org_id em todas as tabelas existentes
🔲 **Não iniciado**

**Escopo:**
- Migration adicionando `org_id` em: projects, channels, research_archives, idea_archives, blog_drafts, video_drafts, shorts_drafts, podcast_drafts, canonical_core, templates, assets, wordpress_configs, ai_provider_configs
- Preencher org_id dos dados existentes (backfill)
- Atualizar RLS policies para filtrar por org
- Atualizar todas as queries na API para filtrar por org_id

**Critérios de aceite:**
- [ ] Todas as tabelas têm org_id NOT NULL
- [ ] Dados existentes migrados corretamente
- [ ] Queries filtram por org_id do usuário logado
- [ ] Cross-org access bloqueado

**Concluído em:** —

---

### F1-007 — Supabase Storage: buckets + policies
🔲 **Não iniciado**

**Escopo:**
- Criar buckets: `images`, `audio`, `video`, `thumbnails`, `exports`
- RLS policies (org members can read/write own org)
- Estrutura de pastas: `{bucket}/{org_id}/{project_id}/{file}`
- Helper functions para upload/download
- Migrar imagens de `public/generated-images/` para Storage

**Critérios de aceite:**
- [ ] Upload funciona com autenticação
- [ ] Download funciona para membros da org
- [ ] Cross-org bloqueado
- [ ] Imagens existentes migradas
- [ ] CDN URL funciona

**Concluído em:** —

---

### F1-008 — Tabela credit_usage + migration
🔲 **Não iniciado**

**Escopo:**
- Criar tabela `credit_usage`
- Adicionar campos de créditos em `organizations` (credits_total, credits_used, credits_addon, credits_reset_at)
- Adicionar `credit_limit` e `credits_used_cycle` em `org_memberships`
- Zod schemas

**Critérios de aceite:**
- [ ] Migration roda
- [ ] Free plan: 1000 créditos por padrão
- [ ] Tipos gerados

**Concluído em:** —

---

### F1-009 — Middleware de créditos (check + debit)
🔲 **Não iniciado**

**Escopo:**
- `checkCredits(orgId, userId, cost)` — verifica saldo antes de ação
- `debitCredits(orgId, userId, action, cost)` — debita após ação
- Lógica: usa addon credits primeiro, depois do plano
- Member credit limit (se configurado)
- Retornar `InsufficientCreditsError` com saldo e data de reset

**Critérios de aceite:**
- [ ] Bloqueia ação se créditos insuficientes
- [ ] Debita corretamente (addon primeiro)
- [ ] Respeita member limit se configurado
- [ ] Log em credit_usage

**Concluído em:** —

---

### F1-010 — UI: Dashboard de créditos
🔲 **Não iniciado**

**Escopo:**
- Widget no dashboard mostrando: saldo, % usado, data de reset
- Barra de progresso visual
- Uso por categoria (texto, voz, imagem, vídeo)
- Uso por membro (para admin/owner)
- Alertas visuais em 80% e 95%

**Critérios de aceite:**
- [ ] Mostra saldo em tempo real
- [ ] Barra de progresso com cores (verde/amarelo/vermelho)
- [ ] Uso por categoria funciona
- [ ] Admin vê uso por membro

**Concluído em:** —

---

### F1-011 — Rate limiting
🔲 **Não iniciado**

**Escopo:**
- Integrar Upstash Redis para rate limiting
- Limites por plano (Free: 30/min, Starter: 60, Creator: 120, Pro: 300)
- Headers de rate limit na response (X-RateLimit-*)
- Retornar 429 com mensagem clara

**Critérios de aceite:**
- [ ] Rate limit aplicado por org
- [ ] Headers corretos na response
- [ ] 429 retorna tempo até reset

**Concluído em:** —

---

### F1-012 — Sentry + logs estruturados
🔲 **Não iniciado**

**Escopo:**
- Integrar Sentry no apps/app e apps/api
- Source maps para stack traces legíveis
- Logger estruturado (Pino) com contexto (org_id, user_id, request_id)
- Alertas para erros novos

**Critérios de aceite:**
- [ ] Erros aparecem no Sentry com stack trace legível
- [ ] Logs têm org_id e request_id
- [ ] Alerta de email no Sentry para erros novos

**Concluído em:** —
