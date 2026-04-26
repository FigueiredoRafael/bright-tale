---
id: M-002
title: Credits model — DB, débito, uso extra com cap
status: ready
sprint: S1
depends-on: [M-001]
estimate: 4d
defaults-applied: 2026-04-25
---

> **[autopilot defaults]** Bloco de top-up: 1.000 tokens por $5 (1.5× preço efetivo do Starter — Starter $9 / 5k = $0.0018/token; extra $5 / 1.000 = $0.005/token).

# M-002 — Credits model

Schema de tokens no DB + lógica de débito por ação + uso extra (overage)
com **cap configurável** pra evitar inadimplência.

## Decisões fechadas

- **Refresh:** reset mensal (perde sobra) — alinhado com ciclo Stripe.
- **Pay-as-you-go:** opt-in toggle (igual Claude). Default: off.
- **Cap obrigatório:** quando user liga "uso extra", define teto em $ ou
  N tokens. Atinge teto → bloqueia até próximo ciclo OU upgrade. Isso evita
  user gastar 500 tokens extras, sair, e ficar devendo.
- **Granularidade extra:** por bloco (ex.: 1.000 tokens = $X). Igual ElevenLabs/Claude.

## Decisões pendentes (§S1.2)

- ⚠️ Preço do bloco extra: $/1.000 tokens? (sugestão: 1.5× preço efetivo do plano)
- ⚠️ Tamanho do bloco: 1.000? 5.000?

## Scope

- **Schema:**
  ```sql
  user_token_balance (user_id, plan_tokens, extra_tokens, period_start, period_end)
  token_transactions (id, user_id, kind, amount, action, metadata, created_at)
  -- kind: grant_plan | grant_topup | grant_donation | grant_coupon | spend | refund_revert
  user_extra_settings (user_id, enabled, cap_usd, cap_tokens)
  ```
- **API:**
  - `POST /api/internal/tokens/spend` (chamada por agentes/jobs) — atomic
  - `GET /api/tokens/balance` (UI consume)
  - `POST /api/tokens/topup` — cria Stripe Checkout pra top-up
- **Lógica de débito:**
  - Tenta debitar de `plan_tokens` primeiro
  - Se zerou e `extra.enabled` + `cap não atingido` → debita do extra (tracked pra cobrar no fim do ciclo)
  - Se `cap atingido` ou `extra.disabled` → retorna `INSUFFICIENT_TOKENS`
- **Cobrança do extra:**
  - Acumula em `user_token_balance.extra_used_tokens`
  - No final do ciclo (Stripe webhook `invoice.upcoming`) cria invoice line
- **Cron:** mensal, reseta `plan_tokens` no `period_end` + zera `extra_used_tokens`

## Acceptance criteria

- [ ] Migration completa, RLS habilitado, GRANTs corretos
- [ ] Função `debit_tokens(user_id, action_kind, amount)` atomic via Postgres function
- [ ] Test: spend → balance correto
- [ ] Test: extra desativado → block com `INSUFFICIENT_TOKENS`
- [ ] Test: extra ativado + cap atingido → block
- [ ] Test: reset mensal limpa plan_tokens

## Files

- `supabase/migrations/{ts}_token_balance.sql` (new)
- `apps/api/src/routes/tokens/*` (new)
- `apps/api/src/lib/tokens/*` (new)
- `apps/api/src/lib/__tests__/tokens.test.ts`

## Out of scope

- UI de balance (M-004)
- Notificações de "X% restante" (M-005)
- Donations (M-012)
