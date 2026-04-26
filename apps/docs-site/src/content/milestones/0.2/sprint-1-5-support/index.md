# Sprint 1.5 — Notifications + Support

**Objetivo:** Sistema de notificações em tempo real + chatbot AI pra suporte + auto-refund + escalação. Fecha o ciclo de pós-venda.

**Specs:** [`docs/specs/v0.2-cards/`](https://github.com/FigueiredoRafael/bright-tale/tree/staging/docs/specs/v0.2-cards) (cards M-005 → M-010)

**Depende de:** Sprint 1 (M-001 + M-002) — refunds precisam Stripe + tokens.

**Progresso:** 0/6 implementados

---

## Cards

### M-005 — Notification system (Realtime + email + bell)

🔲 **Status:** ready (autopilot defaults)

**Defaults aplicados:**
- Backend: **Supabase Realtime** (WebSocket nativo, integra com auth/cookies)
- Email: **Resend** (já no projeto via affiliate-email-service)
- TTL: 90 dias (cron limpa)
- Mandatórias (não desligáveis): pagamento falhou + segurança
- UI: badge contador + dropdown + marcar todas + página dedicada `/notifications`
- Broadcast: `owner` + `admin`; rate-limit `admin` 1/h, `owner` ilimitado

**Schema:** `notifications` + `notification_preferences` (opt-out por categoria/canal).

**Casos de uso (todos ligados):** plano (créditos baixos / expira / pagamento falhou), doações (M-012), convites de team, anúncios da plataforma, jobs assíncronos prontos.

**Estimate:** 5 dias

---

### M-006 — Support chatbot (FAQ + refunds + plan changes)

🔲 **Status:** ready (autopilot defaults)

**Defaults aplicados:**
- Stack: **Anthropic Claude Haiku 4.5** com tools customizadas (mesma família dos agents BC_*)
- Rota própria: `/api/support/chat` (streaming)
- Histórico persistido em `support_threads` + `support_messages`
- Bot resolve sozinho: FAQ + refunds (M-007) + plan changes + reset senha + cancelamento
- Cancelamento aciona ticket high pro admin + afiliado (save flow)
- Escala após 7 mensagens sem resolver (configurável)

**Tools do bot:** `lookup_user_plan`, `request_refund`, `cancel_subscription`, `change_plan`, `escalate`.

**Estimate:** 6 dias

---

### M-007 — Auto-refund + anti-fraud safeguards

🔲 **Status:** ready (autopilot defaults)

**Defaults aplicados:**
- Janela: ≤7d sem uso, OU ≤24h com ≤10% gasto
- Cap auto-aprovação: $50 USD (acima → escala)
- Traps anti-abuso (qualquer um → bloqueia auto + escala P1):
  - Email: 1 refund vitalício
  - IP: 2 refunds em 30d
  - Cartão (Stripe `payment_method.fingerprint`): 1 vitalício
  - Conta < 24h: bloqueia
  - Velocity global: > 10 refunds/h dispara alerta
- Audit obrigatório em `refund_audit` (user, valor, regra, %, IP, payment_method)
- Lista filtrável `/admin/refunds`
- Reverter auto-refund: diferido até consulta jurídica

**Estimate:** 4 dias

---

### M-008 — Support escalation + admin queue (P0–P3 + SLA)

🔲 **Status:** ready

**Decisões fechadas:**
- Alerta: sino (M-005) + fila `/admin/support` + email
- Prioridade: P0 (15 min) / P1 (2h) / P2 (8h) / P3 (24h) — todos configuráveis
- Fila ordenada: mix prioridade + SLA-restante (peso configurável)
- SLA breach: highlight vermelho + notifica owner + auto-escala N% do SLA
- Contexto pré-carregado: resumo conversa + plano + 5 jobs + histórico tickets + afiliado + health score
- Atende: `support` é primária; admin/owner veem; cherry-pick (sem round-robin)
- Status: `open → in_progress → waiting_user → resolved → closed`
- Reabertura: até 14d após `closed`

**Estimate:** 5 dias

---

### M-009 — Post-sale lifecycle (welcome / NPS / churn)

🔲 **Status:** ready (autopilot defaults)

**Defaults aplicados:** ligar TODOS os 6 triggers + health score.

**Triggers:**
- Email de boas-vindas (logo após primeiro pagamento)
- Wizard de onboarding na 1ª sessão
- Check-in 7d após pagamento
- Alerta de "não usou nos últimos 14d" (churn)
- Pesquisa NPS após 30d
- Email de aniversário do plano (1m, 6m, 1y)

**Health score** (calculado diariamente):
- Engagement (jobs últimos 30d) — 40%
- NPS recente — 30%
- Tickets de suporte/refund — 30%

**Estimate:** 3 dias

---

### M-010 — Affiliate lifecycle notifications

🔲 **Status:** ready (autopilot defaults)

**Defaults aplicados:**
- Notifica em **todos** eventos: refunds, cancels, upgrades, tickets
- LGPD-safe: afiliado vê só evento (sem detalhe do ticket / PII)
- Canal: email + painel (`/affiliate/dashboard`)
- Webhook customizado fica pra v0.3

**Source of truth:** `@tn-figueiredo/affiliate` (Thiago). Pós-venda só consome.

**Estimate:** 2 dias

---

## Sub-total

**25 dev-dias** (≈ 5 semanas com 1 dev, ou 2.5 semanas com 2 devs em paralelo)

## Dependências internas

```
M-005 (notifications) ──┬──> M-006 (chatbot — usa notify pra escalar)
                        ├──> M-008 (escalation queue + alerts)
                        ├──> M-009 (post-sale events)
                        └──> M-010 (affiliate notifications)

M-001 (Stripe) ──> M-007 (auto-refund usa Stripe Refund API)

M-006 + M-007 ──> M-008 (chatbot escala via M-008)
```
