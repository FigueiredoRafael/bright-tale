---
title: Payments — Stripe + Mercado Pago
status: draft
milestone: v2.0
author: Rafael
date: 2026-04-11
points: TBD
---

# Payments — Stripe + Mercado Pago

## Conceito

Stripe como gateway principal (global). Mercado Pago como alternativa para Brasil (PIX, boleto).

---

## 1. Checkout Flow

```
Usuário clica "Upgrade" na landing ou app
    ↓
Seleciona plano + ciclo (mensal/anual)
    ↓
Stripe Checkout Session (hosted page)
    ↓
Paga (cartão / Apple Pay / Google Pay)
    ↓
Stripe webhook → nosso backend
    ↓
Backend atualiza org: plano + créditos + datas
    ↓
Redirect → app com plano ativo
```

### Para Brasil (PIX/Boleto):

```
Usuário seleciona "Pagar com PIX"
    ↓
Stripe Checkout com payment_method_types: ['pix', 'boleto']
  OU
Mercado Pago Checkout
    ↓
Paga via PIX (QR code) ou boleto
    ↓
Webhook confirma pagamento
    ↓
Backend atualiza org
```

---

## 2. Stripe Integration

### Products & Prices (criar no Stripe Dashboard)

| Product | Price ID (mensal) | Price ID (anual) |
|---|---|---|
| Free | — (sem cobrança) | — |
| Starter | `price_starter_monthly` | `price_starter_annual` |
| Creator | `price_creator_monthly` | `price_creator_annual` |
| Pro | `price_pro_monthly` | `price_pro_annual` |

### Checkout Session

```typescript
const session = await stripe.checkout.sessions.create({
  customer: org.stripeCustomerId,  // ou criar novo
  mode: 'subscription',
  line_items: [{
    price: 'price_creator_monthly',
    quantity: 1,
  }],
  success_url: `${APP_URL}/settings/billing?success=true`,
  cancel_url: `${APP_URL}/settings/billing?cancelled=true`,
  metadata: {
    org_id: org.id,
  },
  // Para Brasil:
  payment_method_types: ['card', 'pix', 'boleto'],
  // Trial:
  subscription_data: {
    trial_period_days: 7,  // Pro tem 7 dias trial
  },
})
```

### Customer Portal (gerenciar assinatura)

```typescript
const portalSession = await stripe.billingPortal.sessions.create({
  customer: org.stripeCustomerId,
  return_url: `${APP_URL}/settings/billing`,
})
// Redirect → portalSession.url
// Lá o usuário pode: cancelar, trocar cartão, ver faturas
```

---

## 3. Webhooks

### Eventos que precisamos tratar

| Evento Stripe | Ação no Backend |
|---|---|
| `checkout.session.completed` | Criar subscription, atualizar org plano + créditos |
| `customer.subscription.created` | Confirmar subscription ativa |
| `customer.subscription.updated` | Upgrade/downgrade — ajustar créditos |
| `customer.subscription.deleted` | Cancelamento — downgrade para Free no fim do período |
| `invoice.paid` | Pagamento confirmado — resetar créditos do ciclo |
| `invoice.payment_failed` | Pagamento falhou — notificar, retry automático |
| `customer.subscription.trial_will_end` | Trial acaba em 3 dias — email avisando |

### Webhook Handler

```typescript
// POST /api/webhooks/stripe
app.post('/api/webhooks/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature']
  const event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET)
  
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const orgId = session.metadata.org_id
      const subscriptionId = session.subscription
      
      // Buscar detalhes da subscription
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const priceId = subscription.items.data[0].price.id
      const plan = mapPriceIdToPlan(priceId)
      
      // Atualizar org
      await supabase.from('organizations').update({
        stripe_customer_id: session.customer,
        stripe_subscription_id: subscriptionId,
        plan: plan.name,
        credits_total: plan.credits,
        credits_used: 0,
        credits_reset_at: new Date(subscription.current_period_end * 1000),
        plan_started_at: new Date(),
      }).eq('id', orgId)
      
      break
    }
    
    case 'invoice.paid': {
      // Novo ciclo de billing → resetar créditos
      const subscription = await stripe.subscriptions.retrieve(
        event.data.object.subscription
      )
      const org = await findOrgByStripeCustomer(event.data.object.customer)
      
      await supabase.from('organizations').update({
        credits_used: 0,  // reset
        credits_reset_at: new Date(subscription.current_period_end * 1000),
      }).eq('id', org.id)
      
      // Reset credit_used_cycle de todos os membros
      await supabase.from('org_memberships').update({
        credits_used_cycle: 0,
      }).eq('org_id', org.id)
      
      break
    }
    
    case 'customer.subscription.deleted': {
      const org = await findOrgByStripeSubscription(
        event.data.object.id
      )
      
      await supabase.from('organizations').update({
        plan: 'free',
        credits_total: 1000,
        stripe_subscription_id: null,
      }).eq('id', org.id)
      
      break
    }
    
    case 'invoice.payment_failed': {
      const org = await findOrgByStripeCustomer(event.data.object.customer)
      // Enviar email avisando
      // Stripe faz retry automático (3x em 7 dias)
      break
    }
  }
  
  res.json({ received: true })
})
```

### Mapeamento Plan → Créditos

```typescript
const PLAN_CONFIG = {
  free:    { credits: 1_000,  seats: 1, price_monthly: 0 },
  starter: { credits: 5_000,  seats: 1, price_monthly: 900 },   // $9
  creator: { credits: 15_000, seats: 1, price_monthly: 2900 },  // $29
  pro:     { credits: 50_000, seats: 3, price_monthly: 9900 },  // $99
}
```

---

## 4. Upgrade / Downgrade

### Upgrade (imediato)

```
Creator → Pro:
1. Stripe prorate: cobra diferença pro-rata
2. Créditos aumentam imediatamente (15K → 50K)
3. Credits_used mantém (não reseta)
4. Novas features desbloqueiam imediatamente
```

### Downgrade (fim do período)

```
Pro → Starter:
1. Stripe schedule: muda no fim do período
2. Até lá: mantém features do Pro
3. No reset: créditos caem para 5K
4. Se tinha mais de 1 membro: avisa que vai perder seats
```

---

## 5. Add-on Packs (créditos avulsos)

### Stripe Products (one-time)

```typescript
const session = await stripe.checkout.sessions.create({
  mode: 'payment',  // one-time, não subscription
  line_items: [{
    price: 'price_credits_5000',  // $12
    quantity: 1,
  }],
  metadata: { org_id: org.id, credits: 5000 },
})
```

### No webhook:

```typescript
case 'checkout.session.completed': {
  if (session.mode === 'payment') {
    // Add-on de créditos
    const credits = parseInt(session.metadata.credits)
    await supabase.rpc('add_addon_credits', {
      p_org_id: session.metadata.org_id,
      p_credits: credits,
    })
  }
}
```

Add-on credits vão para `credits_addon` (não resetam no ciclo).

---

## 6. Middleware de Créditos

```typescript
// Middleware que verifica créditos antes de ação
async function checkCredits(orgId: string, userId: string, cost: number) {
  const org = await getOrg(orgId)
  const available = (org.credits_total - org.credits_used) + org.credits_addon
  
  if (available < cost) {
    throw new InsufficientCreditsError({
      required: cost,
      available,
      resetAt: org.credits_reset_at,
    })
  }
  
  // Check member limit (se configurado)
  const membership = await getMembership(orgId, userId)
  if (membership.credit_limit) {
    const memberAvailable = membership.credit_limit - membership.credits_used_cycle
    if (memberAvailable < cost) {
      throw new MemberCreditLimitError({
        required: cost,
        available: memberAvailable,
        limit: membership.credit_limit,
      })
    }
  }
}

// Após executar ação, debitar
async function debitCredits(orgId: string, userId: string, action: string, cost: number) {
  // Usar addon credits primeiro, depois do plano
  const org = await getOrg(orgId)
  let fromAddon = 0
  let fromPlan = cost
  
  if (org.credits_addon > 0) {
    fromAddon = Math.min(org.credits_addon, cost)
    fromPlan = cost - fromAddon
  }
  
  await supabase.from('organizations').update({
    credits_used: org.credits_used + fromPlan,
    credits_addon: org.credits_addon - fromAddon,
  }).eq('id', orgId)
  
  await supabase.from('org_memberships').update({
    credits_used_cycle: membership.credits_used_cycle + cost,
  }).eq('org_id', orgId).eq('user_id', userId)
  
  // Log usage
  await supabase.from('credit_usage').insert({
    org_id: orgId,
    user_id: userId,
    action,
    credits_used: cost,
  })
}
```

---

## 7. Alertas de Créditos

| Threshold | Ação |
|---|---|
| 80% usado | Badge amarelo no dashboard |
| 95% usado | Email para Owner + badge vermelho |
| 100% usado | Bloqueia ações que gastam créditos, mostra modal de upgrade/add-on |

---

## 8. Data Model

```sql
-- Já definido em auth-teams.md:
-- organizations.stripe_customer_id
-- organizations.stripe_subscription_id
-- organizations.plan
-- organizations.credits_total / credits_used / credits_addon / credits_reset_at

-- Tabela de pagamentos/faturas (espelho do Stripe)
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations NOT NULL,
  
  stripe_invoice_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  
  amount INTEGER NOT NULL,          -- em centavos
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL,              -- paid, failed, pending, refunded
  
  plan TEXT,                         -- plano que estava pagando
  billing_cycle TEXT,                -- monthly, annual
  
  -- Add-on (se for compra de créditos)
  is_addon BOOLEAN DEFAULT false,
  addon_credits INTEGER,
  
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Webhook events log (para debug e idempotência)
CREATE TABLE stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  data_json JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 9. Variáveis de Ambiente

```
# apps/api/.env.local
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...  # para frontend

# Mercado Pago (alternativa BR)
MERCADOPAGO_ACCESS_TOKEN=...
MERCADOPAGO_WEBHOOK_SECRET=...
```

---

## 10. API Routes

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/billing/checkout` | Criar Stripe Checkout Session |
| POST | `/api/billing/portal` | Criar Customer Portal Session |
| GET | `/api/billing/subscription` | Status da subscription |
| GET | `/api/billing/invoices` | Listar faturas |
| POST | `/api/billing/addon` | Comprar créditos avulsos |
| POST | `/api/webhooks/stripe` | Stripe webhook handler |
| POST | `/api/webhooks/mercadopago` | Mercado Pago webhook handler |
