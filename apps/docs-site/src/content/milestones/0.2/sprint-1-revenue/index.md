# Sprint 1 — Revenue Path

**Objetivo:** Acabar o ciclo Stripe → tokens → consumo. Fundação revenue do BrightTale.

**Specs:** [`docs/specs/v0.2-cards/`](https://github.com/FigueiredoRafael/bright-tale/tree/staging/docs/specs/v0.2-cards) (cards M-001 → M-004) + [`payments-stripe.md`](/roadmap/payments) + [`pricing-plans.md`](/roadmap/pricing)

**Depende de:** M-000 ✅ Foundations (wording / currency / FX cache)

**Progresso:** 0/4 implementados (todos pré-requisitos cumpridos, prontos pra começar)

> ⚠️ Todo card DEVE incluir testes automatizados antes de ser marcado ✅ concluído.

---

## Cards

### M-001 — Stripe wiring (checkout + webhooks + métodos de pagamento)

🔲 **Status:** ready (autopilot defaults aplicados)

**Defaults aplicados:**
- Métodos: Cartão + Apple Pay + Google Pay (Stripe global). Pix BR via Stripe nativo no lançamento BR.
- Modelo: subscription mensal + créditos avulsos (top-up) + opção anual com 20% desconto.
- Sem trial — usar free tier (M-003).
- Geo-detect via header `x-vercel-ip-country` (Vercel Edge); user pode override em settings.

**Entrega:**
- Stripe Products + Prices (Free / Starter / Creator / Pro)
- `POST /api/checkout/session` cria Stripe Checkout Session
- Webhook `POST /api/stripe/webhook` (signature validation, idempotency)
- Customer Portal `POST /api/billing/portal`

**Estimate:** 5 dias

---

### M-002 — Credits model in DB + uso extra com cap

🔲 **Status:** ready (autopilot defaults aplicados, SQL ready-to-apply)

**Defaults aplicados:**
- Bloco extra: 1.000 tokens / $5 (1.5× preço efetivo do Starter).
- Reset mensal (perde sobra). Pay-as-you-go opt-in COM cap obrigatório.
- Refresh dos créditos: reset mensal alinhado com ciclo Stripe.

**Estende sistema existente** (`organizations.credits_*` + `credit_usage`):
- ALTER `organizations`: `extra_enabled`, `extra_cap_usd_cents`, `extra_used_usd_cents`, `signup_bonus_credits`, `signup_bonus_expires_at`
- Nova tabela `pricing_config` (block size, free tier values configuráveis)
- Trigger `apply_signup_bonus` no INSERT de organizations (M-003)

**Estimate:** 4 dias

---

### M-003 — Free tier setup

🔲 **Status:** ready (autopilot defaults — Opção C)

**Defaults aplicados:**
- 500 tokens/mês recorrente + 2.000 tokens bônus na 1ª semana (gancho de ativação).
- Bônus expira automaticamente após 7 dias (configurável via `pricing_config`).
- Ao virar pago, bônus é absorvido (não soma com plano pago).

**Entrega:**
- Trigger no `organizations` insert grants free tier credits + bonus
- Cron diário expira bônus ≥ 7 dias
- UI mostra "Bônus expira em X dias" no /usage page (M-004)

**Estimate:** 1 dia

---

### M-004 — `/usage` page (Claude-style)

🔲 **Status:** ready

**Componentes:**
- Barra de progresso da sessão atual (window 4h se aplicar)
- Barras por categoria (texto / imagem / áudio / vídeo)
- Barra mensal total
- "Última atualização" + botão refresh
- Toggle "uso extra" com cap configurável
- Histórico de transações paginado
- Real-time via Supabase Realtime

**Quem vê:** o próprio user + admins do org (B2B/team) com drill-down.

**Estimate:** 4 dias

---

## Sub-total

**14 dev-dias** (≈ 2 semanas com 1 dev, ou 1 semana com 2 devs em paralelo)

## Dependências internas

```
M-001 (Stripe) ─┬──> M-002 (credits + extra cap)
                │       │
                │       ├──> M-003 (free tier)
                │       └──> M-004 (/usage page)
```

M-001 e M-002 são paralelizáveis até o ponto de top-up (que precisa Stripe Checkout). M-003 + M-004 são curtos depois de M-002 fechar.
