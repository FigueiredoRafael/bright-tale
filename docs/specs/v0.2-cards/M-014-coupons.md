---
id: M-014
title: Coupons (all types)
status: needs-decisions
sprint: S2
depends-on: [M-001]
estimate: 4d
---

# M-014 — Coupons

Cupons de 4 tipos: percentual, fixo, créditos grátis, trial estendido.

## Decisões fechadas

- **Tipos:** todos (percentual, fixo, crédito grátis, trial estendido).
- **Limites:** alinhados com `pricing-projections.md` (qtd total, qtd por user, validade, restrição a planos).

## Decisões pendentes (§S2.4)

- ⚠️ **Stripe API vs custom:** user prefere menos código. Recomendação:
  - Stripe Coupons + Promotion Codes pra **percentual + fixo + trial estendido** (zero código adicional)
  - Custom só pra **crédito grátis** (Stripe não modela isso) — chama M-002 grant
- ⚠️ Limites numéricos exatos (max usos total, etc.)

## Scope

- **Schema (custom só pra credit-grant coupons):**
  ```sql
  custom_coupons (
    id, code, kind, -- 'credit_grant' (outros vão direto Stripe)
    credits_amount, max_uses_total, max_uses_per_user,
    valid_from, valid_until, allowed_plan_ids text[],
    created_by, archived_at
  )
  coupon_redemptions (id, coupon_id, user_id, redeemed_at)
  ```
- **API:**
  - `POST /api/coupons/redeem` — body `{ code }`, retorna sucesso ou erro
  - Para Stripe coupons: Stripe valida no Checkout Session, não chamamos
  - Para credit-grant: validamos limites, executamos M-002 grant
- **Admin UI:**
  - `/admin/coupons` — listar (Stripe + custom unified view via API)
  - `/admin/coupons/new` — wizard escolhe tipo
  - Stripe types criam via Stripe API; credit-grant cria custom row

## Acceptance criteria

- [ ] Stripe coupons criados via API funcionam no Checkout
- [ ] Credit-grant coupon → user usa em `/redeem` → tokens creditados
- [ ] Limite "max usos total" enforced
- [ ] Limite "1 vez por user" enforced
- [ ] Test: cupom expirado → erro
- [ ] Test: cupom restrito ao plano X → falha pra outros

## Files

- `supabase/migrations/{ts}_custom_coupons.sql` (new)
- `apps/api/src/routes/coupons/*` (new)
- `apps/web/src/app/zadmin/(protected)/coupons/*` (new)

## Out of scope

- Stack de retargeting / referral coupons (use afiliados)
- Bulk import CSV
