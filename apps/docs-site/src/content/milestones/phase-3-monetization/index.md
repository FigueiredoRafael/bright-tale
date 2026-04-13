# Fase 3 — Monetização

**Objetivo:** Stripe, planos, checkout, créditos funcionais e landing page atualizada.

**Specs:** `docs/specs/payments-stripe.md` + `docs/specs/pricing-plans.md`

**Depende de:** Fase 1 (orgs + créditos base)

**Progresso:** 0/12 concluídos

> ⚠️ **Regra obrigatória:** Todo card DEVE incluir testes automatizados antes de ser marcado ✅ concluído.
> Ver [`docs/specs/testing-requirements.md`](/spec/testing-requirements) para cobertura mínima por tipo de card.

---

## Cards

### F3-001 — Stripe: config + products + prices
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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
🔲 **Não iniciado**

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

### F3-012 — Plano VIP (Gold) — pay-as-you-go, cost-price, invite-only
🔲 **Não iniciado**

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
