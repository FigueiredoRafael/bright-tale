---
id: M-017
title: End-user optional 2FA (TOTP)
status: done
sprint: S3
depends-on: []
estimate: 2d
delivered: 2026-04-25
---

# M-017 — End-user optional 2FA

User comum no `apps/app` pode opcionalmente ligar 2FA via TOTP (Google
Authenticator, Authy, etc.). Não obrigatório.

## Decisões fechadas

- **Opcional via toggle.** User decide.
- TOTP (Supabase nativo). SMS fica fora de scope (custo).

## Scope

- **UI:** `/account/security` no `apps/app`
  - Status: "2FA está [OFF / ON]"
  - Botão "Ligar 2FA" → modal com QR code (Supabase Auth MFA)
  - Após enroll: mostra códigos de recuperação (mesma lógica do M-016)
  - Botão "Desligar 2FA" → confirma com senha
- **Login flow:** Supabase já entrega isso via `mfa.challenge` quando user tem factor
- **Sem AAL2 gate forçado** no app (admin-only — M-016)

## Acceptance criteria

- [ ] Página `/account/security` mostra estado correto
- [ ] Enroll funciona (QR + verify code)
- [ ] Disable funciona (com senha)
- [ ] Login pede 2FA quando user enrollou
- [ ] Test: user sem 2FA loga normal; user com 2FA pede código

## Files

- `apps/app/src/app/(authenticated)/account/security/*` (new)
- `apps/app/src/components/auth/MfaEnroll.tsx` (new)
- Reutiliza recovery codes de M-016 (mesma tabela, scopes diferentes via RLS)

## Out of scope

- Forçar 2FA por org policy
- WebAuthn / passkeys
