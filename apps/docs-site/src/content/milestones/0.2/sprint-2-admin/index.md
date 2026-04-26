# Sprint 2 — Admin Tooling

**Objetivo:** Ferramentas administrativas pra operar o produto: reset de uso, doações de tokens, planos custom, cupons, dashboard financeiro.

**Specs:** [`docs/specs/v0.2-cards/`](https://github.com/FigueiredoRafael/bright-tale/tree/staging/docs/specs/v0.2-cards) (cards M-011 → M-015)

**Depende de:** Sprint 1 (M-001 + M-002) + Sprint 1.5 (M-005 pra notificações)

**Progresso:** 0/5 implementados (sidebar + stub pages prontos via M-018)

---

## Cards

### M-011 — Reset usage (individual + bulk)

🔲 **Status:** ready

**Decisões fechadas:**
- Quem pode: `owner` + `admin` (configurável — owner pode delegar `support`)
- Bulk: por org, por plano, por filtro custom (search + checkboxes)
- Audit trail com **motivo obrigatório**

**Schema:** `token_reset_audit` + `role_permissions` (delegação).

**UI:** ficha do user → botão "Reset tokens" (modal pede motivo). `/admin/users/bulk` pra bulk.

**Estimate:** 2 dias

---

### M-012 — Credit donations (admin → user)

🔲 **Status:** ready

**Decisões fechadas:**
- Custo: conta interna BrightTale (admin master)
- Limites: aprovação de outro admin se passar de threshold (configurável)
- Notificação: email + in-app (M-005)

**Schema:** `token_donations` (status: `pending_approval | approved | denied | executed`) + `donation_config` (auto_approve_threshold).

**Doação ≤ threshold:** executa direto. Doação > threshold: vai pra fila `/admin/donations` com notificação aos approvers.

**Estimate:** 3 dias

---

### M-013 — Custom plans (preço de custo)

🔲 **Status:** ready

**Decisões fechadas:**
- Quem cria: `owner` 100% off; `admin` até 30% off por X tempo
- Tipo: clone de plano existente OU custom from-scratch
- Atribuição: por user (1:1) OU por org (todos members herdam)

**Schema:** `custom_plans` + `user_plan_overrides` + `org_plan_overrides`.

**Stripe sync:** cria Stripe Price dynamically via API quando atribui (idempotente).

**Estimate:** 3 dias

---

### M-014 — Coupons (Stripe + custom credit-grant)

🔲 **Status:** ready (autopilot defaults)

**Defaults aplicados:**
- Stack híbrida: Stripe Coupons + Promotion Codes pra `percentual / fixo / trial estendido` (zero código adicional)
- Custom só pra `credit_grant` (Stripe não modela)
- Limites: max usos total, max usos/user, validade, planos permitidos

**Schema:** `custom_coupons` (só `credit_grant`) + `coupon_redemptions`.

**API:** `POST /api/coupons/redeem` valida limites + executa M-002 grant. Stripe coupons rolam direto pelo Checkout.

**Estimate:** 4 dias

---

### M-015 — Finance dashboard (revenue × cost × margin)

🔲 **Status:** ready (autopilot defaults)

**Defaults aplicados:**
- Margem: verde > 40%, amarelo 20-40%, vermelho < 20%
- Charts: TODOS (linha receita×custo, área de margem, top 10 users mais caros, pizza por provider, MRR waterfall)
- Granularidade: TODA (plano / user / org / país / afiliado)
- Alertas proativos: TODOS
- Cotação: usa USD do Stripe (sem FX próprio)
- Acesso: `owner` + nova role `billing`

**Schema:** view materializada `mv_finance_daily` (refresh hourly).

**Estimate:** 5 dias

---

## Sub-total

**17 dev-dias** (≈ 3.5 semanas com 1 dev)

## Dependências internas

```
M-002 (credits) ──┬──> M-011 (reset) + M-012 (donations) + M-013 (custom plans)
                  └──> M-015 (finance — custo de operação vem de credit_usage)

M-001 (Stripe) ──┬──> M-013 (Stripe Price dynamically)
                 ├──> M-014 (Stripe Coupons)
                 └──> M-015 (Stripe revenue webhooks)

M-005 (notifications) ──> M-012 (notifica recipient + approvers)
```
