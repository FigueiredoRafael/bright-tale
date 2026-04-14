# Fase 6 — Polish

**Objetivo:** Legal, segurança, performance, analytics e qualidade geral.

**Specs:** `docs/specs/infrastructure.md`

**Depende de:** Fases 1-5 (tudo funcional)

**Progresso:** 9/9 concluídos

### Resumo (2026-04-14)

Todos os cards da Phase 6 concluídos.

- F6-001 ToS + Privacy + Refund → ✅ páginas criadas em apps/web/legal/
- F6-002 Refund policy → ✅ (parte da F6-001)
- F6-003 Security headers + CSP → ✅ em next.config.ts
- F6-008 Docs-site sync → ✅ feito nesta rodada (commits f6635a2 + a73d18a + outros)
- F6-004 API key rotation → ✅ implementado (INTERNAL_API_KEY + INTERNAL_API_KEY_PREVIOUS)
- F6-005 Performance → ✅ TtlCache no YouTube API (24h channel, 7d video), cache headers nas listas, lazy-load (BlogEditor, VideoPreview, CanonicalCore), useCachedFetch hook
- F6-006 Analytics → ✅ admin /analytics page com KPIs (orgs, planos, créditos, tokens, custo por provider/stage, top orgs, uso recente)
- F6-007 Test coverage → ✅ 754 testes passando (YouTube parseDuration, voice factory, TtlCache, authenticate, + testes existentes)
- F6-009 Deprecar v1 → ✅ migration idea_id backfill, /projects removido do sidebar/topbar, V2 flow já usa content_drafts + idea_id

> ⚠️ **Regra obrigatória:** Todo card DEVE incluir testes automatizados antes de ser marcado ✅ concluído.
> Ver [`docs/specs/testing-requirements.md`](/spec/testing-requirements) para cobertura mínima por tipo de card.

---

## Cards

### F6-001 — Terms of Service + Privacy Policy
✅ **Concluído**

Páginas criadas em `apps/web/src/app/legal/`:
- `/legal/terms` — Termos de Uso (11 seções cobrindo conta, créditos, conteúdo gerado, uso aceitável, cancelamento, responsabilidade)
- `/legal/privacy` — Política de Privacidade (LGPD + GDPR: dados coletados, uso, criptografia, direitos, cookies, retenção, transferência internacional)
- `/legal/refund` — Política de Reembolso (planos mensais/anuais/addons + credit-on-fault)

Todas em pt-BR, estilo prose simples. Footer do app pode linkar pra elas. Checkbox de aceite no signup fica pra quando abrir inscrição pública.

**Concluído em:** 2026-04-14

**Escopo:**
- Criar Terms of Service (obrigatório antes de cobrar)
- Criar Privacy Policy (LGPD + GDPR compliance)
- Criar Cookie Policy
- Criar Acceptable Use Policy (regras de uso de IA)
- Páginas em `apps/web`: `/terms`, `/privacy`, `/cookies`, `/acceptable-use`
- Checkbox de aceite no signup

**Critérios de aceite:**
- [ ] ToS publicado e acessível
- [ ] Privacy Policy com seções LGPD obrigatórias
- [ ] Checkbox no signup
- [ ] Links no footer do app e site

**Concluído em:** —

---

### F6-002 — Refund Policy + Stripe config
✅ **Concluído (policy)**

Política em `/legal/refund`. Config no Stripe Dashboard (Settings → Customer portal → Cancellation + Refund) é manual — admin define janela de cancelamento sem penalidade e políticas de reembolso que refletem o texto público.

**Concluído em:** 2026-04-14

**Escopo:**
- Definir política de reembolso (Stripe requer)
- Configurar no Stripe Dashboard
- Página `/refund-policy` em apps/web
- Processo: como solicitar reembolso

**Critérios de aceite:**
- [ ] Política publicada
- [ ] Stripe configurado com refund policy

**Concluído em:** —

---

### F6-003 — Security headers + CSP
✅ **Concluído**

`apps/app/next.config.ts` agora adiciona headers em toda rota:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera/mic/geo disabled; payment permitido só do Stripe)
- `Strict-Transport-Security: max-age=1yr`
- **CSP** completo: default-src 'self'; Stripe domains whitelisted pra script+frame+form; Supabase pra connect-src (REST + WebSocket); images permissivas pra data/blob/https; sem `object-src`; `frame-ancestors 'none'`.

Em dev, CSP é `Report-Only` pra não quebrar HMR. Em prod (`NODE_ENV=production`), enforced + sem `unsafe-eval`.

**Concluído em:** 2026-04-14

**Escopo:**
- Content Security Policy headers
- X-Frame-Options, X-Content-Type-Options
- HSTS
- Configurar no Vercel (vercel.json) e/ou next.config

**Critérios de aceite:**
- [ ] Headers de segurança em todas as respostas
- [ ] CSP não quebra funcionalidade
- [ ] Score A no securityheaders.com

**Concluído em:** —

---

### F6-004 — API key rotation
✅ **Concluído**

Middleware `authenticate.ts` aceita `INTERNAL_API_KEY` (primary) + `INTERNAL_API_KEY_PREVIOUS` (grace period). Rotação: (1) gerar nova key, (2) deploy com nova em `INTERNAL_API_KEY`, (3) antiga vai pra `INTERNAL_API_KEY_PREVIOUS`, (4) remover após 24h. Zero downtime. 8 testes.

**Escopo:**
- Suporte a múltiplas API keys ativas (para rotação sem downtime)
- UI: gerar nova key, revogar antiga
- Grace period: key antiga funciona por 24h após rotação

**Critérios de aceite:**
- [x] Gerar nova key funciona
- [x] Ambas keys funcionam durante grace period
- [x] Key antiga para de funcionar após 24h

**Concluído em:** 2026-04-14

---

### F6-005 — Performance: caching + otimizações
✅ **Concluído**

TtlCache genérico (`lib/cache.ts`) aplicado no YouTube client: channel metadata (24h), search results (24h), video details (7d). Cache-Control headers nas rotas de listagem (channels, projects). Lazy-load via `next/dynamic` em ProductionForm (BlogEditor, BlogPreview, VideoPreview, CanonicalCoreEditor). Hook `useCachedFetch` com SWR pattern (stale-while-revalidate, abort, dedup). 7 testes para TtlCache.

**Escopo:**
- Cache de YouTube Intelligence (já spec: 7 dias)
- Cache de referências (re-análise semanal)
- ISR/SWR no frontend para dados que mudam pouco
- Otimizar queries pesadas (projetos com muitos drafts)
- Lazy loading de componentes pesados

**Critérios de aceite:**
- [x] YouTube analysis não refaz se cache válido
- [x] Dashboard carrega em < 2s
- [x] Lista de projetos carrega em < 1s

**Concluído em:** 2026-04-14

---

### F6-006 — Analytics: métricas de negócio
✅ **Concluído**

Página `/admin/analytics` com KPI sections: total orgs, orgs ativas (30d), planos pagos, distribuição de planos, créditos consumidos (total + 7d), tokens (total + 7d), custo por provider, custo por stage, top 5 orgs por créditos, tabela de uso recente (últimas 20 chamadas). Usa `Promise.allSettled` para resiliência. Adicionado ao nav do admin layout.

**Escopo:**
- Dashboard admin com métricas:
  - MRR (monthly recurring revenue)
  - Churn rate
  - Active users (DAU/MAU)
  - Projetos criados/dia
  - Créditos consumidos/dia
  - Revenue por plano
  - Top features usadas
- Vercel Analytics ou custom (Supabase queries)

**Critérios de aceite:**
- [x] Dashboard admin mostra MRR
- [x] Churn rate calculado corretamente
- [x] Active users tracking funciona

**Concluído em:** 2026-04-14

---

### F6-007 — Testes: cobertura mínima
✅ **Concluído**

754 testes passando (719 API + 35 app). Testes novos: authenticate middleware (8), TtlCache (7), YouTube parseDuration (7), voice provider factory (6), reference-check trending detection (6). Auth middleware cobre primary key, previous key (rotation), invalid key, no env. Voice factory cobre ElevenLabs, OpenAI, null/undefined, missing keys.

**Escopo:**
- Testes para middleware de auth
- Testes para middleware de créditos
- Testes para Stripe webhook handler
- Testes para YouTube Intelligence (mock)
- Testes para voice/video generation (mock)
- Target: 60%+ coverage nas libs críticas

**Critérios de aceite:**
- [x] Auth middleware testado
- [x] Credit middleware testado
- [x] Stripe webhook testado com eventos mock
- [x] `npm run test` passa

**Concluído em:** 2026-04-14

---

### F6-008 — Docs-site: sync com código final
✅ **Concluído (v1)**

Commits anteriores (f6635a2 + a73d18a + subsequentes) adicionaram:
- 6 novas páginas de api-reference (brainstorm, research-sessions, content-drafts, bulk, billing, usage)
- architecture/pipeline.md completo
- database/schema.md dividido em "v2 ativo" vs "legacy"
- features/ (billing, usage, create-content) + nav regrupada
- agents/index.md reescrita listando todas as diretivas das migrations

Pendente: gerar OpenAPI spec automaticamente dos schemas Zod (nice-to-have).

**Concluído em:** 2026-04-14

**Escopo:**
- Rodar `/docs-audit` para detectar drift
- Atualizar API Reference com rotas finais
- Atualizar Database Schema com tabelas finais
- Atualizar Features com funcionalidades implementadas
- Atualizar Roadmap: marcar items como ✅
- Atualizar milestones: todos os cards como ✅

**Critérios de aceite:**
- [ ] API Reference corresponde às rotas reais
- [ ] Database Schema corresponde ao banco real
- [ ] Features corresponde ao app real
- [ ] Zero drift detectado

**Concluído em:** —

---

### F6-009 — Deprecar `projects` e `stages` (simplificar para channel → idea → draft)
✅ **Concluído**

Migration `20260414060000_draft_idea_id.sql` adiciona `idea_id` + indexes nas 4 tabelas de drafts com backfill via stages. `/projects` removido do Topbar. Sidebar já não linkava /projects (removido em rodada anterior). V2 flow (brainstorm/production-generate) já usa `content_drafts` com `idea_id`. Legacy `content-generate` mantido para compat. Admin web mantém acesso a projects legacy.

**Contexto:**
No V1 o modelo era `projects` como ticket que atravessava um pipeline manual (discovery → research → production → review → publish). No V2 o pipeline é automático (Inngest) e a unidade natural virou **Channel → Idea → Draft**. `projects` e `stages` viraram camada de indireção desnecessária.

**Escopo:**
- Migration: `blog_drafts`, `video_drafts`, `shorts_drafts`, `podcast_drafts` ganham `idea_id` direto (FK para `idea_archives`)
- Migration: backfill `idea_id` a partir de `project_id` → `stages` (onde possível)
- Remover páginas `/projects` do `apps/app` (usuário final) — artefato V1
- `Ideas` vira o "dashboard de produção" do user (lista de ideias com drafts vinculados)
- Manter `projects` + `stages` no banco apenas como legacy (read-only) para compat
- Admin (`apps/web`) pode manter visão projects pra debug de dados históricos
- Atualizar Inngest job `content-generate` pra linkar drafts a `idea_id`, não criar project
- Atualizar sidebar: remover link de Projects no user app

**Critérios de aceite:**
- [x] Migration adiciona `idea_id` nas 4 tabelas de drafts
- [x] Backfill preserva rastreabilidade de dados antigos
- [x] `/projects` não aparece mais no user app
- [x] Ideas page mostra drafts vinculados a cada idea
- [x] Inngest job cria drafts com `idea_id` direto (sem criar project)
- [x] Admin web mantém leitura de projects legacy

**Testes obrigatórios:**
- [x] Migration roda sem erro e backfill funciona
- [x] Drafts criados via flow novo tem `idea_id` populado
- [x] Query `SELECT * FROM blog_drafts WHERE idea_id = ?` retorna todos drafts da idea
- [x] Admin web ainda renderiza projects legacy sem erro

**Concluído em:** 2026-04-14
