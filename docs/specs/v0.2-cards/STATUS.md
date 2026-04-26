---
title: V0.2 — Status (autopilot session 2026-04-25)
date: 2026-04-25
---

# V0.2 — Status atual

Snapshot do progresso feito em modo autopilot enquanto você dormia.

## Done ✅

- **M-000 — Foundations**
  - `WORDING.TOKENS` constants em `@brighttale/shared`
  - `formatCurrency()` + `currencyForCountry()` helpers (USD/BRL/EUR)
  - Migration `currency_rates` aplicada (✅ via push staging)
  - Vercel cron `0 8 * * *` em `/currency-refresh`
  - 8 tests passing
  - `CONVENTIONS.md` doc

- **M-017 — End-user 2FA**
  - `/settings/security` page no `apps/app`
  - States: loading | disabled | enrolling | enabled | error
  - Link "Segurança" no settings index

## In progress 🟡

- **M-018 — Admin redesign**
  - ✅ Sidebar expandida com 5 grupos (Principal / Gestão / Monetização / Operações / Sistema)
  - ✅ 6 stub pages com `<ComingSoon />` referenciando o card M-XXX correspondente
  - ✅ Settings page do admin
  - 🔲 Pendente: dashboard home com KPIs + user mgmt revamp + skeletons + visual review

- **M-019 — Sales page**
  - ✅ `/upgrade` no `apps/app` (4 cards de plano + monthly/yearly toggle + top-up section + refund/payment footer)
  - 🔲 Pendente: tapa concreto em `apps/web` landing pública (já é uma página polida; faltam números explícitos)

## Bloqueado por migration apply 🚧

11 migrations propostas em [`migrations/`](./migrations/). Cada arquivo é
idempotente (`IF NOT EXISTS` / `OR REPLACE` / `ON CONFLICT`).

**Pra desbloquear (estimado: 5-10 min):**

```bash
# 1. Copia todas pra supabase/migrations
cp docs/specs/v0.2-cards/migrations/*.sql supabase/migrations/

# 2. Push pro Supabase dev
npm run db:push:dev

# 3. Regen types
npm run db:types

# 4. Commita
git add supabase/migrations/ packages/shared/src/types/database.ts
git commit -m "feat(db): apply v0.2 migrations (M-002..M-016)"
```

**Cards que destravam após apply:**

| Card | Status |
|---|---|
| M-002 (credits + extra cap) | needs migration → ready to implement |
| M-003 (free tier signup bonus) | needs M-002 → ready to implement |
| M-004 (/usage page) | needs M-002 → ready to implement |
| M-005 (notifications) | needs migration → ready to implement |
| M-006 (chatbot) | needs M-005 + M-007 → ready to implement |
| M-007 (auto-refund) | needs M-001 + migration → semi-blocked (M-001 also pending) |
| M-008 (escalation queue) | needs M-005 + M-006 → ready chain |
| M-009 (post-sale) | needs M-005 → ready chain |
| M-010 (affiliate notif) | needs M-005 + M-008 → ready chain |
| M-011 (reset usage) | needs M-002 → ready to implement |
| M-012 (donations) | needs M-002 + M-005 → ready chain |
| M-013 (custom plans) | needs M-001 + M-002 → semi-blocked (M-001 pending) |
| M-014 (coupons) | needs M-001 → semi-blocked (Stripe coupons + custom credit_grant) |
| M-015 (finance dashboard) | needs M-001 + M-002 → semi-blocked |
| M-016 (MFA recovery) | needs migration → ready to implement |

## Bloqueado em decisão de business (M-001 — Stripe)

M-001 (Stripe wiring) tem autopilot defaults aplicados, mas requer:

- ⚠️ **Você criar manualmente os Products + Prices no Stripe Dashboard** (sandbox primeiro). Anota os Price IDs num `.env`.
- ⚠️ **Endpoint de webhook precisa de URL pública** + `STRIPE_WEBHOOK_SECRET` configurado no Vercel.
- ⚠️ **Pix BR via Stripe**: precisa habilitar no Stripe Dashboard pra conta BR.

Posso scaffoldar o código (routes, webhook handler, types) mesmo sem os
Stripe products criados — você pluga as Price IDs depois. Me avise no
próximo turno se quer que eu faça isso.

## Defaults aplicados (autopilot — pode reverter qualquer um)

| Card | Defaults |
|---|---|
| M-001 | Stripe + Pix BR + Apple/Google Pay; sub mensal + top-up + 20% anual; sem trial |
| M-002 | Bloco extra: 1.000 tokens / $5 |
| M-003 | Free tier opção C: 500/mês + 2k bônus 1ª semana |
| M-005 | Supabase Realtime + Resend; TTL 90d; granular prefs; broadcast 1/h admin |
| M-006 | Anthropic Claude Haiku 4.5 + tools customizadas (rota própria) |
| M-007 | 10% uso máx; cap $50; email 1 vitalício; IP 2 em 30d; cartão fingerprint 1 vitalício; conta < 24h bloqueia; velocity > 10/h alerta |
| M-008 | SLAs P0=15min / P1=2h / P2=8h / P3=24h (configuráveis) |
| M-009 | Todos os triggers + health score (engagement 40% / NPS 30% / tickets 30%) |
| M-010 | Notifica todos eventos; LGPD-safe; email + painel |
| M-014 | Stripe Coupons + custom só pra credit_grant |
| M-015 | Margem verde > 40% / amarelo 20–40% / vermelho < 20%; todos charts/granularidade/alertas; Stripe USD |
| M-016 | Recovery codes SIM (10 Argon2id); lost-phone UI SIM; auto-unenroll NÃO |

## Ordem recomendada de ataque

```
[NOITE - DONE]
  M-000 ✅  M-017 ✅  Migrations propostas ✅  /upgrade ✅  Admin sidebar ✅

[MANHÃ - próximos passos]

  1. Aplicar migrations propostas (5 min)
     → desbloqueia M-002, M-005, M-011, M-016, M-009 (parcial)

  2. Implementar M-002 (credits extra + signup bonus integration) — 4d
  3. Implementar M-005 (notifications system) — 5d (paralelo com M-002)
  4. Implementar M-016 (MFA recovery codes) — 3d (paralelo com tudo)

  5. Você criar Stripe products → desbloqueia M-001
  6. Implementar M-001 (Stripe wiring) — 5d
     → desbloqueia M-007, M-013, M-014, M-015

  7. Implementar M-003 (free tier) — 1d (depois de M-002)
  8. Implementar M-004 (/usage page) — 4d (depois de M-002)
  9. Implementar M-007 (auto-refund) — 4d (depois de M-001 + M-002)
  10. Implementar M-006 + M-008 (chatbot + escalation) — 11d
  11. Implementar M-011 + M-012 + M-013 + M-014 + M-015 — 17d
  12. Implementar M-009 + M-010 — 5d
  13. Finalizar M-018 (admin redesign visual) — 3-4d
  14. Finalizar M-019 (apps/web landing) — 2d
```

## Total estimado restante

~67 dev-dias (≈ 7 semanas com 1 dev, 3-4 semanas com 2 devs paralelo)

## Dúvidas que ainda esperam você

(do roadmap original — algumas posso assumir defaults adicionais quando voltar):

- **Free tier:** confirma opção C (500/mo + 2k bônus 1ª semana)?
- **Stripe products** no dashboard: quer que eu monte um script `setup-stripe.ts` pra criar todos via API (sandbox + prod) automaticamente?
- **Sales page (apps/web)**: prefere reescrever do zero ou só adicionar números concretos no que já existe?
