---
id: M-013
title: Custom plans (owner full discount, admin 30% temp)
status: ready
sprint: S2
depends-on: [M-001, M-002]
estimate: 3d
---

# M-013 — Custom plans

Owner cria planos custom (até preço de custo). Admin pode aplicar descontos
de até 30% por X tempo. Atribuição por user 1:1 ou por org.

## Decisões fechadas

- **Quem cria:** `owner` 100% off; `admin` até 30% off por X tempo.
- **Tipo:** clone de plano existente OU custom from-scratch.
- **Atribuição:** por user (1:1) OU por org (todos members herdam).

## Scope

- **Schema:**
  ```sql
  custom_plans (
    id, name, parent_plan_id, -- null se custom from-scratch
    monthly_tokens, monthly_price_usd, billing_cycle,
    discount_pct, valid_until, -- pra descontos temporários
    created_by, created_at, archived_at
  )
  user_plan_overrides (
    id, user_id, custom_plan_id, assigned_by, valid_from, valid_until
  )
  org_plan_overrides (
    id, org_id, custom_plan_id, assigned_by, valid_from, valid_until
  )
  ```
- **Permissions:**
  - `owner` → criar plano com qualquer preço (incluindo custo)
  - `admin` → criar plano com no máx 30% off do plano-pai, valid_until ≤ 90d
- **Stripe sync:** cria Stripe Price dynamically via API quando atribui (idempotente)
- **Admin UI:**
  - `/admin/plans` — lista + filtro
  - `/admin/plans/new` — wizard (clone vs from-scratch)
  - `/admin/users/[id]/assign-plan` — modal pra atribuir
  - `/admin/orgs/[id]/assign-plan` — idem pra org

## Acceptance criteria

- [ ] Migration + RLS
- [ ] Validação server-side: admin não passa 30% / 90d
- [ ] Owner pode tudo
- [ ] Stripe Price criado dynamically e linkado
- [ ] User com override usa o plano custom no checkout
- [ ] Test: admin tenta criar 50% off → 403
- [ ] Test: org override → todos members veem o plano custom

## Files

- `supabase/migrations/{ts}_custom_plans.sql` (new)
- `apps/web/src/app/zadmin/(protected)/plans/*` (new)
- `apps/api/src/routes/admin/plans.ts` (new)

## Out of scope

- UI pra user trocar plano sozinho (já no Customer Portal do Stripe via M-001)
- Histórico de overrides expirados (mantém arquivado)
