---
id: M-010
title: Affiliate lifecycle notifications
status: needs-decisions
sprint: S1.5
depends-on: [M-005, M-008]
estimate: 2d
---

# M-010 — Affiliate notifications

Afiliado que indicou o user recebe avisos do ciclo de vida dele (refund,
upgrade, ticket, churn) pra tentar reverter ou entender.

## Decisões pendentes (§S1.5)

- ⚠️ **Quais eventos notificar** (sugestão: tudo — refunds, cancels, upgrades)
- ⚠️ **Privacidade** — sugestão LGPD-safe: afiliado vê só evento (sem detalhe do ticket), tipo "Seu referral X cancelou"
- ⚠️ **Canal** — sugestão: email + painel (`/affiliate/dashboard`); webhook é nice-to-have

## Scope sugerido

- Subscriber em `support_threads` insert/update + lifecycle events (M-009)
- Lookup do afiliado via `@tn-figueiredo/affiliate` (Thiago é source of truth)
- Notificação compõe via M-005 mas vai pro `affiliate.user_id`, não pro referral
- Template: "Seu referral [primeiro nome] [evento]. [CTA: ver painel]"

## Acceptance criteria

- [ ] Hook quando refund processado (M-007) → notifica afiliado
- [ ] Hook quando subscription cancelada (Stripe webhook) → notifica afiliado
- [ ] Hook quando upgrade → notifica afiliado (positivo)
- [ ] Painel do afiliado mostra timeline de eventos dos referrals
- [ ] LGPD: nenhum detalhe sensível no email

## Files

- `apps/api/src/lib/affiliate/lifecycle-hooks.ts` (new)
- `apps/api/src/lib/email/templates/affiliate-event.tsx` (new)

## Out of scope

- Webhook customizado pro afiliado (v0.3)
- Dashboard analytics avançado (já existe básico no @tn-figueiredo/affiliate)
