---
id: M-000
title: Foundations — nomenclature, currency, base infra
status: ready
sprint: foundations
depends-on: []
estimate: 1d
---

# M-000 — Foundations

Decisões cross-cutting que vários cards consomem. Resolver primeiro.

## Decisões fechadas

- **Nomenclatura:** `tokens` (não "créditos"). Refactor de strings UI/copy
  onde aparecer "créditos" pra "tokens" — ressalva: campos DB existentes
  (`credits_*`) podem ficar; só camada de apresentação muda.
- **Moeda base:** USD. BRL/EUR são derivados via cotação do dia + `toFixed(2)`.
  Source of truth: webhook do Stripe (que já entrega em USD).
- **Multi-currency UI:** auto-detecta país via geo-IP (Vercel header
  `x-vercel-ip-country`) e mostra preço local. Toggle manual na UI permite
  trocar.
- **Refunds (política):** 7 dias se não gastou nada, 24h se gastou pouco
  (ver M-007 pro % exato — TBD).

## Acceptance criteria

- [ ] String constant `WORDING.TOKENS = 'tokens'` em `packages/shared/`
- [ ] Helper `formatCurrency(amountUsd, locale)` em `packages/shared/`:
  - Detecta locale do user (header geo-IP no SSR; navigator.language no client)
  - Aplica cotação USD→BRL/EUR via API gratuita (cache 1h)
  - Output: `R$ 49,90` / `$9.99` / `€ 9,99`
- [ ] Tabela `currency_rates (currency, rate_to_usd, fetched_at)` + cron 1×/dia
- [ ] Test snapshot: 3 valores em 3 moedas (BRL, USD, EUR)
- [ ] Doc atualizado: `docs/specs/v0.2-cards/CONVENTIONS.md` com ambos

## Files

- `packages/shared/src/constants/wording.ts` (new)
- `packages/shared/src/utils/format-currency.ts` (new)
- `packages/shared/src/utils/__tests__/format-currency.test.ts` (new)
- `apps/api/src/routes/internal/currency-refresh.ts` (new — cron handler)
- `supabase/migrations/{ts}_currency_rates.sql` (new)

## Out of scope

- Auto-billing em moeda local (Stripe lida)
- Conversões em tempo-real (cache 1h é suficiente)
