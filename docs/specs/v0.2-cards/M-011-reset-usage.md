---
id: M-011
title: Reset usage (individual + bulk)
status: ready
sprint: S2
depends-on: [M-002]
estimate: 2d
---

# M-011 — Reset usage

Admin reseta tokens de um user individual ou em bulk (filtros).

## Decisões fechadas

- **Quem pode:** `owner` + `admin` por padrão. Owner pode delegar pra `support` via setting.
- **Bulk select:** por org, por plano, ou filtro custom (search + checkboxes).
- **Audit:** quem + quando + **motivo obrigatório** (texto).

## Scope

- **Schema:**
  ```sql
  token_reset_audit (id, target_user_id, reset_by, reset_at, reason, prev_balance, new_balance)
  role_permissions (role text, permission text PK_combo) -- pra delegar
  ```
- **Admin UI:**
  - `/admin/users` ficha do user → botão "Reset tokens"
  - Modal pede motivo → confirma → executa + log
  - `/admin/users/bulk` filtro + checkbox + bulk action "Reset"
- **Settings UI:** `/admin/settings/permissions` — checkbox "Permitir support resetar tokens"

## Acceptance criteria

- [ ] Migration + RLS
- [ ] UI individual + bulk
- [ ] Motivo obrigatório (validation client + server)
- [ ] Audit log filtrável
- [ ] Test: reset → balance volta a `plan_tokens` do plano atual; sobra do extra zerada
- [ ] Test: support sem permissão → 403

## Files

- `supabase/migrations/{ts}_token_reset_audit.sql` (new)
- `apps/web/src/app/zadmin/(protected)/users/[id]/actions/reset-tokens.tsx` (new)
- `apps/api/src/routes/admin/tokens-reset.ts` (new)

## Out of scope

- Reset agendado / recorrente
- Reset parcial (só de certa categoria)
