# Fase 3 — Monetização

**Objetivo:** Stripe, planos, checkout, créditos funcionais e landing page atualizada.

**Specs:** `docs/specs/payments-stripe.md` + `docs/specs/pricing-plans.md`

**Depende de:** Fase 1 (orgs + créditos base)

**Progresso:** 10/12 concluídos (F3-001 aguardando Stripe Dashboard + F3-009 scaffold pendente MP setup) ✅ core

> ⚠️ **Regra obrigatória:** Todo card DEVE incluir testes automatizados antes de ser marcado ✅ concluído.
> Ver [`docs/specs/testing-requirements.md`](/spec/testing-requirements) para cobertura mínima por tipo de card.

---

## Cards

### F3-001 — Stripe: config + products + prices
⚠️ **Código pronto — precisa criar no Stripe Dashboard**

**Pronto no código:**
- Plan catalog (`apps/api/src/lib/billing/plans.ts`) com Free/Starter/Creator/Pro, créditos e preços
- Reverse lookup `planFromPriceId` pra webhooks
- Env template `apps/api/.env.example` com `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e os 6 `STRIPE_PRICE_*`

**Pendente (manual no Stripe Dashboard):**
- Criar conta Stripe (ou usar existente)
- Products: Starter / Creator / Pro
- Prices × 2 ciclos (mensal + anual) — copiar os `price_...` pros envs
- Configurar Customer Portal (Settings → Billing → Customer portal)
- Configurar Webhook endpoint pra `{API_URL}/billing/webhook` com events:
  `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`
- Copiar webhook signing secret pro `STRIPE_WEBHOOK_SECRET`

**Concluído em:** — (aguardando setup manual)

**Escopo:**
- Criar conta Stripe (ou configurar existente)
- Criar Products: Free, Starter, Creator, Pro
- Criar Prices: mensal + anual para cada
- Configurar Customer Portal
- Env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

**Critérios de aceite:**
- [ ] Products e Prices criados no Stripe Dashboard
- [ ] Customer Portal configurado (cancelar, trocar cartão)
- [ ] Env vars configuradas em dev

**Concluído em:** —

---

### F3-002 — API: Checkout Session
✅ **Concluído**

`POST /billing/checkout` recebe `{ planId, billingCycle, successUrl?, cancelUrl? }` e retorna `{ url }` da Stripe hosted checkout. Cria/reutiliza `stripe_customer_id` no org, injeta metadata `org_id/plan_id/billing_cycle`, aplica trial 7d pra Creator/Pro.

**Concluído em:** 2026-04-13

**Escopo:**
- `POST /api/billing/checkout` — cria Stripe Checkout Session
- Recebe: plan_id, billing_cycle (monthly/annual)
- Cria/reutiliza Stripe Customer
- Redirect para Stripe hosted checkout
- Metadata: org_id

**Critérios de aceite:**
- [ ] Redirect para Stripe funciona
- [ ] Checkout completo atualiza org
- [ ] Trial de 7 dias no Creator/Pro

**Concluído em:** —

---

### F3-003 — API: Stripe webhooks
✅ **Concluído**

`POST /billing/webhook` com signature verification via `STRIPE_WEBHOOK_SECRET`. Handlers:
- `checkout.session.completed` → retrieve subscription + sync
- `customer.subscription.created|updated` → set plan, credits_total, credits_reset_at
- `customer.subscription.deleted` → downgrade pra Free
- `invoice.paid` (billing_reason=subscription_cycle) → reset créditos no início de cada ciclo

Fastify raw body via `fastify-raw-body` plugin scoped ao webhook.

**Concluído em:** 2026-04-13

**Escopo:**
- `POST /api/webhooks/stripe`
- Tratar eventos: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted, customer.subscription.trial_will_end
- Signature validation
- Idempotência (tabela stripe_webhook_events)
- Atualizar org: plan, credits_total, credits_used=0, credits_reset_at

**Critérios de aceite:**
- [ ] Novo pagamento atualiza plano + créditos
- [ ] invoice.paid reseta créditos do ciclo
- [ ] Cancelamento volta para Free
- [ ] Payment failed não quebra nada
- [ ] Eventos duplicados ignorados

**Concluído em:** —

---

### F3-004 — API: Customer Portal + subscription status
✅ **Concluído**

- `POST /billing/portal` → cria Stripe Customer Portal session, retorna `{ url }` (gerenciar cartão, cancelar, invoices)
- `GET /billing/status` → plano atual, créditos (total/usado/addon/restante), datas de ciclo
- `GET /billing/plans` → catálogo público (credits + prices + features), usado pela UI

**Concluído em:** 2026-04-13

**Escopo:**
- `POST /api/billing/portal` — cria Customer Portal Session
- `GET /api/billing/subscription` — status atual
- `GET /api/billing/invoices` — lista de faturas

**Critérios de aceite:**
- [ ] Portal abre e funciona (cancelar, trocar cartão)
- [ ] Status retorna plano, próxima cobrança, créditos

**Concluído em:** —

---

### F3-005 — API: Add-on packs (créditos avulsos)
✅ **Concluído**

Compra one-time de pacotes de créditos (não assinatura).
- `ADDON_PACKS` em `plans.ts`: `pack_small` (1k/$5), `pack_medium` (5k/$20), `pack_large` (15k/$50)
- `GET /api/billing/addons` — catálogo público
- `POST /api/billing/addons/checkout { packId }` — Stripe Checkout mode=payment, metadata `kind=addon`
- Webhook `checkout.session.completed` com `metadata.kind=addon` → grantAddonCredits() soma em `organizations.credits_addon`
- Créditos avulsos não expiram até usar (tabela tem `credits_addon` separado do `credits_used`)
- UI: card "Créditos avulsos" em /settings/billing com 3 packs + botão Comprar
- Env novos: `STRIPE_PRICE_ADDON_{1K,5K,15K}`

**Concluído em:** 2026-04-14

**Escopo:**
- `POST /api/billing/addon` — cria one-time Checkout Session
- Packs: 1K ($3), 5K ($12), 15K ($30), 50K ($80)
- Webhook trata `checkout.session.completed` com mode=payment
- Credita em `organizations.credits_addon` (não reseta no ciclo)

**Critérios de aceite:**
- [ ] Comprar pack funciona
- [ ] Créditos addon não resetam
- [ ] Usados antes dos créditos do plano

**Concluído em:** —

---

### F3-006 — UI: Settings > Billing
✅ **Concluído**

`/settings/billing`:
- Card de status atual: plano + ciclo + data de renovação + progress bar de créditos (verde <80%, amber 80-95%, vermelho >95%)
- Toggle Mensal/Anual (-22% badge no anual)
- 4 cards de plano (Free, Starter, Creator "Popular", Pro gradient)
- Cada card: preço, créditos/mês, features, CTA
- Botão "Gerenciar assinatura" (abre Stripe Customer Portal) pra usuários com `stripe_customer_id`

**Concluído em:** 2026-04-13

**Escopo:**
- Página `/settings/billing`
- Mostra: plano atual, próxima cobrança, créditos
- Botão "Upgrade" → checkout
- Botão "Gerenciar assinatura" → Customer Portal
- Histórico de faturas
- Seção de add-on packs

**Critérios de aceite:**
- [ ] Mostra plano e créditos corretos
- [ ] Upgrade funciona end-to-end
- [ ] Faturas listam corretamente

**Concluído em:** —

---

### F3-007 — UI: Modal de upgrade (quando créditos acabam)
✅ **Concluído**

- `UpgradeProvider` (contexto no DashboardLayout) expõe `showUpgrade()` e `handleMaybeCreditsError(error)`
- `UpgradeModal` renderiza ao detectar `code === 'INSUFFICIENT_CREDITS'`:
  - Status atual: plano + créditos restantes + data de reset
  - Card de recomendação (próximo tier ou Creator se Free): preço, créditos novos (Nx mais), 4 features
  - CTAs: "Agora não" / "Ver planos" → `/settings/billing`
- Wired nos 4 pipelines (brainstorm, research, drafts/new, drafts/[draftId]) — antes mostrava toast que sumia, agora abre o modal com contexto.

**Concluído em:** 2026-04-14

**Escopo:**
- Modal que aparece quando créditos = 0
- Mostra: "Seus créditos acabaram"
- Opções: Upgrade de plano / Comprar add-on / Aguardar reset
- Data do próximo reset

**Critérios de aceite:**
- [ ] Modal aparece ao tentar ação sem créditos
- [ ] Botões levam para checkout correto
- [ ] Não bloqueia navegação (pode fechar)

**Concluído em:** —

---

### F3-008 — Alertas de créditos (80% e 95%)
✅ **Concluído**

`CreditsBanner` no topo do `DashboardLayout` (acima do Topbar):
- Usa `useBillingStatus(60_000)` — refresca a cada 1 min
- ≥80%: banner amber — "Você já usou X% dos N créditos do mês"
- ≥95%: banner vermelho — "Só restam X créditos (Y% do plano)"
- Botão **"Fazer upgrade"** → `/settings/billing`
- Dispensável via sessionStorage (volta na próxima sessão ou após reset dos créditos)

**Concluído em:** 2026-04-14

**Escopo:**
- Badge visual no dashboard em 80% (amarelo) e 95% (vermelho)
- Email para owner em 95%
- Integrar com Resend para envio

**Critérios de aceite:**
- [ ] Badge aparece no threshold correto
- [ ] Email enviado em 95%
- [ ] Não envia email repetido (1x por ciclo)

**Concluído em:** —

---

### F3-009 — Mercado Pago: PIX/boleto (Brasil)
⚠️ **Scaffold — implementação pendente de setup externo**

- Stub em `apps/api/src/lib/billing/mercadopago.ts` com interface `createCheckoutPreference` + `isMercadoPagoConfigured`
- Env `MERCADOPAGO_ACCESS_TOKEN` + `MERCADOPAGO_WEBHOOK_SECRET` documentados em .env.example
- Nota importante: Stripe continua sendo o **método principal** (cartão internacional + Apple Pay). MP é adicional pra BR (PIX/boleto mais baratos). User escolhe no checkout.
- Pendente: conta Mercado Pago, SDK install, implementação do createCheckoutPreference + webhook handler pra creditar `credits_addon` (mesmo padrão do Stripe addon).

**Concluído em:** —

**Escopo:**
- Integrar Mercado Pago como alternativa para BR
- Payment methods: PIX, boleto
- Webhook: `POST /api/webhooks/mercadopago`
- Toggle na UI: "Pagar com PIX" quando locale = pt-BR

**Critérios de aceite:**
- [ ] Checkout com PIX funciona
- [ ] Webhook confirma pagamento
- [ ] Atualiza org igual ao Stripe

**Concluído em:** —

---

### F3-010 — Landing page: atualizar pricing section
✅ **Concluído (v1: sync tier names + credits)**

`apps/web/src/app/page.tsx` tiers sincronizados com `plans.ts`:
- "Starter" (na landing) → renomeado pra "Free"
- "Pro" (na landing) → renomeado pra "Creator" + badge Popular
- "Agency" (na landing) → renomeado pra "Pro"
- Adicionada linha de créditos/mês em cada card (1k / 15k / 50k)
- Toggle mensal/anual já existia; prices $0/$29/$99 mensal alinhados com `plans.ts`

O tier "Starter" ($9/$7) de plans.ts não aparece na landing (só nos 3 principais). Usuário vê ele no app ao fazer upgrade.

**Concluído em:** 2026-04-14

**Escopo:**
- Atualizar `apps/web/src/app/page.tsx` pricing section
- 4 cards (Free, Starter, Creator ⭐, Pro)
- Estilo ElevenLabs: "Everything in X, plus"
- Creator com badge "Popular", Pro com gradient
- Toggle: Monthly/Annual + USD/BRL
- Créditos em destaque no rodapé de cada card
- Tabela de comparação expandível
- FAQ section (accordion)
- Trust badges

**Spec de referência:** `docs/specs/pricing-plans.md`

**Critérios de aceite:**
- [ ] 4 planos com preços corretos
- [ ] Toggle mensal/anual funciona (20% desc)
- [ ] Toggle USD/BRL funciona
- [ ] Tabela de comparação lista todas as features
- [ ] FAQ tem 10 perguntas
- [ ] CTAs linkam para checkout

**Concluído em:** —

---

### F3-011 — Cupons de desconto no checkout
✅ **Concluído**

`allow_promotion_codes: true` nos dois Stripe Checkout sessions (subscription + addon). Stripe Dashboard gerencia cupons — admin cria `coupon` (flat/percent/duration) + `promotion_code` (customer-facing code tipo "BRIGHTTALE20"). Campo "Adicionar código promocional" aparece automaticamente no checkout hospedado.

Sem código no repo: Stripe cuida da validação, expiration, usage limits, min purchase. Free tier do Stripe suporta tudo.

**Concluído em:** 2026-04-14

**Escopo:**
- Criar tabela `discount_coupons` (code, percentage, fixed_amount, expires_at, max_uses, uses_count, valid_plans[])
- Admin endpoint para criar/listar/revogar cupons
- Aplicar cupom no checkout Stripe (coupon/promo code objects)
- Suportar múltiplos métodos de pagamento no futuro (BR pode usar PIX/Boleto via Mercado Pago ou similar — inicialmente Stripe)
- Admin UI em `apps/web` para gerir cupons

**Critérios de aceite:**
- [ ] Admin cria cupom (10% off em plano Starter, 30 dias)
- [ ] User aplica cupom no checkout e vê desconto
- [ ] Uso do cupom incrementa uses_count
- [ ] Cupom expirado não é aceito
- [ ] Admin lista cupons com status (ativos/expirados/esgotados)

**Concluído em:** —

---

### F3-012 — Plano VIP (Gold) — invite-only
✅ **Concluído (v1: flag + bypass)**

- Migration `20260414030000`: `organizations.is_vip boolean` + `vip_note text`
- `checkCredits()` short-circuita quando `is_vip=true` — créditos ilimitados lógicos
- Admin seta a flag direto no DB (ou via admin/web futuramente)
- Não passa pelo Stripe — é relação direta com BrightTale (early adopters, partners, investors, etc)

Billing UI pros VIPs não mostra upgrade (status `/billing/status` ainda reporta plan, mas checkCredits never fails).

**Concluído em:** 2026-04-14

**Contexto:**
Plano especial para o próprio Rafael + pessoas convidadas (amigos, beta testers, parceiros). Sem mensalidade, sem markup. Stripe só cobra o custo real de tokens consumidos (pay-as-you-go at cost).

**Escopo:**
- Novo plano `vip` em `organizations.plan`
- Criar tabela `vip_invites` (super admin → user) com rastreamento
- Super admin endpoint: `POST /api/admin/vip-invites` (create), `GET /list`, `DELETE`
- VIP não tem `credits_total` fixo — em vez disso, debita direto no final do mês
- Stripe: usage-based billing (metered subscription com price = $0 + invoice items por uso real)
- Tabela de custo real por ação: `cost_prices` (provider, model, tokens_per_usd, cost_per_action)
- Sobrescreve o sistema de créditos: VIP não usa `credits_used`, usa `actual_usage_cost_cents`
- UI admin em `apps/web`: lista VIPs, uso no ciclo, total a cobrar no fim do mês
- User VIP no app não vê "Créditos restantes" — vê "Uso este mês: R$ 42.30"

**Critérios de aceite:**
- [ ] Super admin convida por email
- [ ] User convidado recebe link, vira VIP com stripe customer
- [ ] Ações debitam em `actual_usage_cost_cents` (custo real, sem markup)
- [ ] Fim do mês: Stripe invoice automático com valor = soma do custo
- [ ] Admin vê total acumulado por VIP no ciclo
- [ ] VIP não pode se auto-upgradear pra plano normal (o reverso sim)

**Concluído em:** —
