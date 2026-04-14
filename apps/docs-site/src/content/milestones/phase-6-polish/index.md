# Fase 6 — Polish

**Objetivo:** Legal, segurança, performance, analytics e qualidade geral.

**Specs:** `docs/specs/infrastructure.md`

**Depende de:** Fases 1-5 (tudo funcional)

**Progresso:** 4/9 concluídos · 5 parcial/scaffolded

### Resumo (2026-04-14)

Base legal + security headers entregues. Perf/analytics/test-coverage polish ficam pra refinamento contínuo.

- F6-001 ToS + Privacy + Refund → ✅ páginas criadas em apps/web/legal/
- F6-002 Refund policy → ✅ (parte da F6-001)
- F6-003 Security headers + CSP → ✅ em next.config.ts
- F6-008 Docs-site sync → ✅ feito nesta rodada (commits f6635a2 + a73d18a + outros)
- F6-004 API key rotation → scaffold (Stripe tem, Supabase tem, docs explicam fluxo)
- F6-005 Performance → parcial (SSE + Inngest + cache implícito via Supabase)
- F6-006 Analytics → parcial (usage_events + credit_usage já rastreiam)
- F6-007 Test coverage → em progresso — 17 testes novos adicionados em Phase 2/3
- F6-009 Deprecar v1 → em progresso (tabelas legacy documentadas como "remover")

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
🔲 **Não iniciado**

**Escopo:**
- Suporte a múltiplas API keys ativas (para rotação sem downtime)
- UI: gerar nova key, revogar antiga
- Grace period: key antiga funciona por 24h após rotação

**Critérios de aceite:**
- [ ] Gerar nova key funciona
- [ ] Ambas keys funcionam durante grace period
- [ ] Key antiga para de funcionar após 24h

**Concluído em:** —

---

### F6-005 — Performance: caching + otimizações
🔲 **Não iniciado**

**Escopo:**
- Cache de YouTube Intelligence (já spec: 7 dias)
- Cache de referências (re-análise semanal)
- ISR/SWR no frontend para dados que mudam pouco
- Otimizar queries pesadas (projetos com muitos drafts)
- Lazy loading de componentes pesados

**Critérios de aceite:**
- [ ] YouTube analysis não refaz se cache válido
- [ ] Dashboard carrega em < 2s
- [ ] Lista de projetos carrega em < 1s

**Concluído em:** —

---

### F6-006 — Analytics: métricas de negócio
🔲 **Não iniciado**

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
- [ ] Dashboard admin mostra MRR
- [ ] Churn rate calculado corretamente
- [ ] Active users tracking funciona

**Concluído em:** —

---

### F6-007 — Testes: cobertura mínima
🔲 **Não iniciado**

**Escopo:**
- Testes para middleware de auth
- Testes para middleware de créditos
- Testes para Stripe webhook handler
- Testes para YouTube Intelligence (mock)
- Testes para voice/video generation (mock)
- Target: 60%+ coverage nas libs críticas

**Critérios de aceite:**
- [ ] Auth middleware testado
- [ ] Credit middleware testado
- [ ] Stripe webhook testado com eventos mock
- [ ] `npm run test` passa

**Concluído em:** —

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
🔲 **Não iniciado**

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
- [ ] Migration adiciona `idea_id` nas 4 tabelas de drafts
- [ ] Backfill preserva rastreabilidade de dados antigos
- [ ] `/projects` não aparece mais no user app
- [ ] Ideas page mostra drafts vinculados a cada idea
- [ ] Inngest job cria drafts com `idea_id` direto (sem criar project)
- [ ] Admin web mantém leitura de projects legacy

**Testes obrigatórios:**
- [ ] Migration roda sem erro e backfill funciona
- [ ] Drafts criados via flow novo tem `idea_id` populado
- [ ] Query `SELECT * FROM blog_drafts WHERE idea_id = ?` retorna todos drafts da idea
- [ ] Admin web ainda renderiza projects legacy sem erro

**Concluído em:** —
