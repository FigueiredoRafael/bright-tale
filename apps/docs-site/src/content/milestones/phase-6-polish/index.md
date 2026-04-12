# Fase 6 — Polish

**Objetivo:** Legal, segurança, performance, analytics e qualidade geral.

**Specs:** `docs/specs/infrastructure.md`

**Depende de:** Fases 1-5 (tudo funcional)

**Progresso:** 0/8 concluídos

---

## Cards

### F6-001 — Terms of Service + Privacy Policy
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
