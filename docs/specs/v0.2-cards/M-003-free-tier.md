---
id: M-003
title: Free tier — setup do plano grátis
status: ready
sprint: S1
depends-on: [M-002]
estimate: 1d
defaults-applied: 2026-04-25
---

> **[autopilot defaults]** Opção C — 500 tokens/mês recorrente + 2.000 tokens bônus na 1ª semana (gancho de ativação). Bônus expira ao virar pago.

# M-003 — Free tier

Setup do plano Free no Stripe + lógica de tokens grátis.

## Decisões pendentes (§S1.1)

- ⚠️ **Estrutura do free tier:** escolher uma:
  - A) Recorrente: 500 tokens/mês
  - B) One-shot: 2.000 tokens lifetime
  - C) Híbrido: 500/mês + 2.000 bônus 1ª semana **(recomendado)**

## Scope (assume opção C)

- **No Stripe:** Free é "ausência de subscription", não um Stripe Product
- **No DB:** user sem subscription tem entrada em `user_token_balance` com
  `plan_tokens = 500`, `period_end = now() + 30d`
- **Bônus de ativação:** ao primeiro signup, transação `grant_signup_bonus` de 2.000 tokens
- **Reset mensal** mantém os 500 (consistente com lógica do M-002)
- **Upgrade flow:** quando user vira pago, bônus não-usado é absorvido (não somar com plano pago)

## Acceptance criteria

- [ ] Hook em `auth.users` insert (Supabase trigger) → cria balance com bônus
- [ ] Test: signup → 2.500 tokens (500 plan + 2.000 bonus)
- [ ] Test: 30d depois sem usar → reset → 500 tokens (bônus não renova)
- [ ] Test: upgrade → bônus expira

## Files

- `supabase/migrations/{ts}_signup_bonus.sql` (new)
- `apps/api/src/lib/tokens/grant-signup-bonus.ts` (new)

## Out of scope

- UI mostrando "1ª semana — bônus expira em X dias" → bonus opcional (M-004)
