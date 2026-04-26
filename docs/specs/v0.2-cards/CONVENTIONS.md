---
title: V0.2 Conventions — wording, currency, formatting
status: stable
date: 2026-04-25
---

# V0.2 Conventions

Convenções estabelecidas no M-000 que outros cards consomem. Atualize aqui
se a convenção mudar.

## Wording

- **Tokens** (não "créditos"). Use em UI, copy, emails.
- DB columns existentes (`plan_credits`, `credit_*`) podem ficar como estão
  — só camada de apresentação é normalizada. Refator do schema fica fora
  de escopo.
- Source de truth: `packages/shared/src/constants/wording.ts`
  ```ts
  import { WORDING } from '@brighttale/shared'
  // WORDING.TOKENS, WORDING.TOKENS_TITLE, etc.
  ```
- Plural sempre minúsculo: "10.000 tokens", não "10.000 Tokens".

## Currency

- **Base:** USD. Stripe webhooks já entregam em USD.
- DB columns que armazenam preço/valor: `*_usd` ou `amount_usd numeric(12,2)`.
- Conversão pra BRL/EUR é UI-only via `formatCurrency()`.

### Auto-detecção de moeda

```ts
import { currencyForCountry, formatCurrency } from '@brighttale/shared'

// SSR: header geo-IP do Vercel
const country = headers().get('x-vercel-ip-country')
const currency = currencyForCountry(country)

// Buscar rate (cached na tabela currency_rates)
const { data: rate } = await supabase
  .from('currency_rates')
  .select('rate_to_usd')
  .eq('currency', currency)
  .single()

const display = formatCurrency({
  amountUsd: 9.99,
  currency,
  rateToTarget: rate?.rate_to_usd ?? 1,
})
// → 'R$ 54,95' (BR), '€9.19' (DE), '$9.99' (US)
```

### Refresh dos rates

- Vercel Cron diário em `0 8 * * *` UTC (5h BRT) chama `POST /api/currency-refresh`
- Source: AwesomeAPI (USD-BRL, USD-EUR) — gratuito, sem key
- Fallback: tabela tem seeds (`BRL=5.5`, `EUR=0.92`) caso a API caia na primeira sync.
- Cache: 24h via row `fetched_at`.

## Formatting helpers — onde estão

| Need | Function | Module |
|---|---|---|
| Format USD/BRL/EUR | `formatCurrency()` | `@brighttale/shared` |
| Detect currency from country | `currencyForCountry()` | `@brighttale/shared` |
| Wording constants | `WORDING` | `@brighttale/shared` |

## Tests

- `packages/shared/src/utils/__tests__/format-currency.test.ts` cobre as 3 moedas + edge cases
- Roda com `npx vitest run packages/shared/src/utils/__tests__/format-currency.test.ts`
