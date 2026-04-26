---
id: M-016
title: MFA recovery codes + lost-phone UI
status: ready
sprint: S3
depends-on: []
estimate: 3d
defaults-applied: 2026-04-25
---

> **[autopilot defaults]** Recovery codes: SIM (10 one-shot Argon2id-hashed). Lost-phone UI: SIM (admin A pede, admin B aprova). Auto-unenroll após N falhas: NÃO (vira DoS fácil contra admin).

# M-016 — MFA recovery codes

Quando admin enrolla TOTP, gera 10 códigos one-shot Argon2id-hashed.
Lost-phone flow: admin A pede destravamento, admin B aprova com seu MFA.

## Decisões pendentes (§S3.1)

- ⚠️ Recovery codes ligar?
- ⚠️ Lost-phone UI ligar?
- ⚠️ Auto-unenroll após N falhas (recomendo NÃO — DoS fácil)

## Scope (assume "ligar codes + lost-phone, NÃO auto-unenroll")

- **Schema:**
  ```sql
  mfa_recovery_codes (id, user_id, code_hash, used_at, generated_at)
  mfa_unlock_requests (id, requester_id, status, requested_at, approved_by, approved_at, executed_at)
  ```
- **Enrollment flow:**
  - Após scan QR, gera 10 códigos random 8-char alfanum
  - Hash com Argon2id, store no DB
  - Mostra plain text 1× pro admin (download .txt + "I have saved these" checkbox)
- **Login flow alternativo:**
  - Login → AAL2 challenge → "use código de recuperação" link
  - User cola → server hashea + compara contra `mfa_recovery_codes` não-usados
  - Match → marca `used_at` + emite session AAL2 + força re-enroll na próxima sessão
- **Lost-phone UI (`/admin/mfa/unlock`):**
  - Admin A clica "perdi o telefone" → cria `mfa_unlock_request` status=pending
  - Notifica todos admins ativos (M-005)
  - Admin B abre `/admin/mfa/unlock-requests` → vê pedido → aprova com seu MFA → executa unenroll
  - Admin A na próxima tentativa de login não tem MFA factor → enrolla de novo

## Acceptance criteria

- [ ] Schema + RLS
- [ ] Enrollment gera + mostra códigos 1×
- [ ] Login com código funciona (one-shot)
- [ ] Lost-phone: A pede, B aprova, A consegue logar sem TOTP antigo
- [ ] Test: código já usado → erro
- [ ] Test: B sem MFA não consegue aprovar
- [ ] Doc: `docs/security/ADMIN-PROVISIONING.md` atualizado

## Files

- `supabase/migrations/{ts}_mfa_recovery.sql` (new)
- `apps/web/src/app/zadmin/(protected)/mfa/*` (new — enrollment review + unlock requests)
- `apps/api/src/routes/admin/mfa-recovery.ts` (new)
- `apps/web/src/app/zadmin/login/recovery-code/page.tsx` (new)

## Out of scope

- Backup factors (WebAuthn, etc.) — v0.3
- SMS-based MFA pra admin
