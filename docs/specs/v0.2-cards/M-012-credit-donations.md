---
id: M-012
title: Credit donations (admin → user)
status: ready
sprint: S2
depends-on: [M-002, M-005]
estimate: 3d
---

# M-012 — Credit donations

Admin doa tokens pra um user. Custo desconta da conta interna BrightTale.
Acima de threshold, requer aprovação de outro admin.

## Decisões fechadas

- **Origem do custo:** conta interna BrightTale (não da pessoal do admin).
- **Limites:** aprovação de outro admin se passar de threshold (configurável).
- **Notificação ao user:** email + in-app (M-005).

## Scope

- **Schema:**
  ```sql
  token_donations (
    id, donor_id, recipient_id, amount, reason,
    status, -- pending_approval | approved | denied | executed
    requested_at, approved_by, approved_at, executed_at
  )
  donation_config (
    auto_approve_threshold int,  -- ex: 1.000 tokens
    approver_roles text[]        -- ['owner', 'admin']
  )
  ```
- **Admin UI:**
  - `/admin/users/[id]/donate` — modal: amount + reason + submit
  - `/admin/donations` — fila de pendentes pra aprovar
  - Doação > threshold → vai pra fila com notificação pros approvers
  - Doação ≤ threshold → executa direto
- **Notificações:**
  - User recipient: M-005 push + email "Você recebeu N tokens de [admin]"
  - Approver: M-005 push "Aprovação pendente: [admin] quer doar N tokens pra [user]"

## Acceptance criteria

- [ ] Migration + RLS
- [ ] Doação pequena → executa imediatamente; balance do recipient atualiza
- [ ] Doação grande → fila de aprovação; segundo admin aprova → executa
- [ ] Notificações funcionam (push + email)
- [ ] Token transaction tipo `grant_donation` no histórico
- [ ] Test: doar 100 → executa; doar 10k → pendente

## Files

- `supabase/migrations/{ts}_donations.sql` (new)
- `apps/web/src/app/zadmin/(protected)/donations/*` (new)
- `apps/web/src/app/zadmin/(protected)/users/[id]/actions/donate.tsx` (new)
- `apps/api/src/routes/admin/donations.ts` (new)

## Out of scope

- Doações programadas / recorrentes
- Templates de mensagem
