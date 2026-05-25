# Billing (Stripe)

Prefixo: `/api/billing`

Planos, checkout e assinaturas via Stripe.

## GET `/plans`

Catálogo público (usado pela UI pra mostrar os cards de plano). Não requer auth.

```json
{
  "data": {
    "plans": [
      { "id": "free",    "displayName": "Free",    "credits": 1000,  "usdMonthly": 0,  "usdAnnual": 0,  "features": [...] },
      { "id": "starter", "displayName": "Starter", "credits": 5000,  "usdMonthly": 9,  "usdAnnual": 7,  "features": [...] },
      { "id": "creator", "displayName": "Creator", "credits": 15000, "usdMonthly": 29, "usdAnnual": 23, "features": [...] },
      { "id": "pro",     "displayName": "Pro",     "credits": 50000, "usdMonthly": 99, "usdAnnual": 79, "features": [...] }
    ]
  },
  "error": null
}
```

## GET `/status`

Plano atual do org, créditos, datas.

```json
{
  "data": {
    "plan":       { "id", "displayName", "credits", "usdMonthly", "billingCycle" },
    "credits":    {
      "total",
      "used",
      "addon",
      "reserved",
      "remaining",
      "resetAt",
      "signupBonus",
      "signupBonusExpiresAt"
    },
    "subscription": { "stripeCustomerId", "stripeSubscriptionId", "planStartedAt", "planExpiresAt" }
  },
  "error": null
}
```

**`credits.reserved`** (V2-006) — credits currently held by in-flight background jobs via the reservation system. These have been set aside but not yet charged (job is still running). The formula for effective available balance is:

```
available = (total − used − reserved) + addon + signupBonusRemaining
```

When a job completes, `reserved` decreases and `used` increases by the actual cost. When a job fails or times out, `reserved` decreases and `used` is unchanged (credits fully returned to the pool).

## POST `/checkout`

Cria sessão de checkout Stripe. Reutiliza `stripe_customer_id` se existir, senão cria um.

```json
{
  "planId": "starter" | "creator" | "pro",
  "billingCycle": "monthly" | "annual",
  "successUrl": "opcional — default /settings/billing?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "opcional"
}
```

Response `{ url }` — redirecione o browser pra lá.

Trial de 7 dias aplicado em Creator/Pro; Starter sem trial.

Erros:
- `CONFIG_ERROR`: falta `STRIPE_PRICE_*` no env pro plano/ciclo escolhido.

## POST `/portal`

Stripe Customer Portal (trocar cartão, cancelar, baixar invoices). Requer usuário já ter um Stripe customer (após o primeiro checkout).

Response `{ url }`.

## POST `/webhook`

Endpoint pra Stripe chamar. **Requer signature verification** via `STRIPE_WEBHOOK_SECRET`. Raw body capturado pelo plugin `fastify-raw-body`.

Events processados:

| Event | Ação |
|---|---|
| `checkout.session.completed` | Retrieve subscription + sync |
| `customer.subscription.created` | Sync (set plan + credits_total + reset timestamps) |
| `customer.subscription.updated` | Sync (plan/cycle change) |
| `customer.subscription.deleted` | Downgrade pra free |
| `invoice.paid` (`billing_reason=subscription_cycle`) | Reset credits_used pra 0 no início do novo ciclo |

Outros events são ignorados.

## Setup no Stripe Dashboard (F3-001)

Pra bootstrap a conta:

1. **Products & Prices** — crie 3 products (Starter, Creator, Pro), cada um com 2 prices (monthly + annual). Copie os 6 `price_...` pros envs `STRIPE_PRICE_STARTER_MONTHLY`, etc.
2. **Customer Portal** — Settings → Billing → Customer portal → configure return URL, allow cancel/update payment method.
3. **Webhooks** — Developers → Webhooks → Add endpoint: `{API_URL}/billing/webhook`. Selecione os 4 events acima. Copie o signing secret pro `STRIPE_WEBHOOK_SECRET`.
4. **API keys** — Developers → API keys → copie `sk_test_...` pro `STRIPE_SECRET_KEY`.

## Plan catalog (código)

`apps/api/src/lib/billing/plans.ts` é a fonte da verdade pra créditos/preços/features. `planFromPriceId(priceId)` faz reverse lookup (usado pelos webhooks).
