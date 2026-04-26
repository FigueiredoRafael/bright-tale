---
id: M-007
title: Auto-refund + anti-fraud safeguards
status: ready
sprint: S1.5
depends-on: [M-001]
estimate: 4d
defaults-applied: 2026-04-25
---

> **[autopilot defaults]** Janela 24h: uso máx 10% do plano. Cap auto-aprovação: $50 USD. Limites das traps: email = 1 refund vitalício; IP = 2 em 30d; cartão (fingerprint) = 1 vitalício; conta < 24h = bloqueia; velocity global > 10/h = alerta. Reverter auto-refund: diferido até consultar advogado.

# M-007 — Auto-refund

Lógica de refund automatizado dentro de política. Bot do M-006 chama. Traps
anti-abuso bloqueiam → escalam P1 com tag `fraud_risk`.

## Decisões fechadas

- **Janela:** ≤7d sem uso, ou ≤24h com uso ≤X% (X configurável, sugestão 10%).
- **User confirma** explicitamente "sim" no chat antes de processar.
- **Audit obrigatório:** tabela `refund_audit` com tudo (user, valor, regra, %, IP, payment_method).
- **Lista filtrável:** `/admin/refunds` pra admin auditar.
- **Trap fires (qualquer um):** mesmo email recorrente, mesmo IP recorrente, mesmo cartão, mesmo device, conta < 24h, velocity global.
- **Quando trap dispara:** bot fala "vamos passar pra humano" sem revelar regra; cria P1 `fraud_risk` com bundle de contexto.

## Decisões pendentes (§S1.5)

- ⚠️ **% exato** (sugestão padrão: 10% — configurável em `config.refund_max_used_pct`)
- ⚠️ **Cap de valor** pra auto-refund (sugestão: $50 — acima disso escala)
- ⚠️ **Limites das traps:**
  - mesmo email: 1 refund vitalício (sugestão)
  - mesmo IP: 2 em 30d (sugestão)
  - velocity global: > 10/h triggers alerta
- ⚠️ **Reverter auto-refund** (legal review) — diferir até consultar advogado

## Scope

- **Schema:**
  ```sql
  refund_audit (
    id, user_id, payment_id, amount_usd, decision, rule_matched,
    used_pct, fraud_score, fraud_signals (jsonb), ip, payment_fingerprint,
    decided_at, decided_by (user_id|null=auto)
  )
  refund_config (key text PK, value jsonb)  -- thresholds configuráveis
  ```
- **API:**
  - `POST /api/refunds/evaluate` — chamada pelo bot, retorna `{ eligible, reason, fraud_score }`
  - `POST /api/refunds/process` — chamada pelo bot após user confirmar; chama Stripe Refund API; reverte tokens; loga audit
- **Anti-fraud engine:**
  - Reúso do `@tn-figueiredo/fraud-detection` se aplicar; senão custom
  - Score 0-100; > threshold = trap
- **Admin UI:**
  - `/admin/refunds` — tabela com filtros (status, fraud_score, date range)
  - Drilldown abre fraud_signals expandido + opção de overturn

## Acceptance criteria

- [ ] Schema + RLS + GRANTs
- [ ] Stripe refund integrado (sandbox)
- [ ] Tokens revertidos no balance (M-002 transaction de `refund_revert`)
- [ ] Test: user dentro de janela → auto-aprova
- [ ] Test: 2º refund mesmo email → bloqueia
- [ ] Test: cartão já refunded → bloqueia
- [ ] Admin UI filtra + abre detalhes

## Files

- `supabase/migrations/{ts}_refund_audit.sql` (new)
- `apps/api/src/routes/refunds/*` (new)
- `apps/api/src/lib/refunds/*` (new)
- `apps/web/src/app/zadmin/(protected)/refunds/*` (new)

## Out of scope

- Reversal de auto-refund (jurídico)
- Stripe Disputes flow (manual via dashboard)
