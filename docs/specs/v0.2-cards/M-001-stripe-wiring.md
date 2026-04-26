---
id: M-001
title: Stripe wiring — checkout, webhooks, métodos de pagamento
status: ready
sprint: S1
depends-on: [M-000]
estimate: 5d
defaults-applied: 2026-04-25
---

> **[autopilot defaults]** Pix via Stripe BR nativo (sem MP). Desconto anual: 20% off (2 meses grátis). Geo-detect via header `x-vercel-ip-country` (Vercel Edge); user pode override em settings.

# M-001 — Stripe wiring

Backend completo de pagamentos: planos no Stripe Dashboard, Checkout
Sessions, webhooks, gestão de subscriptions e top-ups.

## Decisões fechadas

- **Métodos de pagamento:** cartão + Apple Pay + Google Pay (Stripe global). Pix BR adicionado quando lançar BR (configurável por país).
- **Modelo:** subscription mensal + créditos avulsos (top-up) + opção anual com desconto.
- **Trial:** sem trial — usar free tier (M-003).

## Decisões pendentes (resolver em [`../v2-monetization-roadmap.md`](../v2-monetization-roadmap.md) §S1.1)

- ⚠️ Geo-detect BR vs gringa: como o produto sabe pra qual mercado mostrar (Pix on/off)?
  - Sugestão: header `x-vercel-ip-country` + override por user setting
- ⚠️ Pix via Stripe BR ou Mercado Pago como fallback? (Stripe nativo é mais simples)
- ⚠️ Desconto anual: %? (sugestão: 20% off = 2 meses grátis)

## Scope

- **Stripe Products & Prices:**
  - Free (sem price)
  - Starter ($9/mo, $86/yr) — 5k tokens
  - Creator ($29/mo, $278/yr) — 15k tokens
  - Pro ($79/mo, $758/yr) — TBD tokens
  - Top-up packages (TBD bloco — M-002)
- **Checkout flow:**
  - `POST /api/checkout/session` cria Stripe Checkout Session
  - Redirect → Stripe hosted page → success/cancel URLs
- **Webhooks:** `POST /api/stripe/webhook`
  - `checkout.session.completed` → ativa plano + credita tokens
  - `invoice.payment_succeeded` → renova ciclo + credita tokens
  - `invoice.payment_failed` → notifica user (M-005)
  - `customer.subscription.deleted` → desativa plano (mantém tokens não-usados)
  - `charge.refunded` → reverter créditos (com cap)
- **Customer Portal:** `POST /api/billing/portal` retorna URL pro Stripe Portal

## Acceptance criteria

- [ ] Migration `stripe_customers`, `subscriptions`, `payments` tables
- [ ] Webhook signature validation (Stripe `Stripe-Signature` header)
- [ ] Idempotency (handle webhook retry)
- [ ] Geo-detect rendering correto preço local
- [ ] E2E test: criar checkout → simular webhook → verificar plano ativo
- [ ] Sandbox + prod Stripe keys via env vars

## Files

- `apps/api/src/routes/checkout/*` (new)
- `apps/api/src/routes/stripe/webhook.ts` (new)
- `apps/api/src/lib/stripe/*` (new)
- `apps/web/src/app/(public)/pricing/*` — checkout button
- `supabase/migrations/{ts}_stripe_payments.sql` (new)
- `docs/specs/payments-stripe.md` — atualizar com decisões finais

## Out of scope

- Mercado Pago — só se Pix Stripe BR não der
- Webhooks pra coupons (M-014)
- Disputes flow (manual via Stripe Dashboard)
