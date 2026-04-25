---
title: V0.2 Milestones — Index
status: draft
milestone: v0.2
date: 2026-04-25
---

# V0.2 Milestones

Cards para a release v0.2 (monetização + polish). Origem das decisões:
[`../v2-monetization-roadmap.md`](../v2-monetization-roadmap.md).

**Status legend:**
- `ready` — todas decisões fechadas, pronto pra começar
- `needs-decisions` — bloqueado em decisão pendente (ver doc-fonte)
- `in-progress` — em desenvolvimento
- `done` — entregue + merged + docs atualizados

## Foundations (resolver primeiro)

| ID | Título | Status | Estimate |
|---|---|---|---:|
| [M-000](./M-000-foundations.md) | Foundations: nomenclature, currency, base infra | ready | 1d |

## Sprint 1 — Revenue Path

| ID | Título | Status | Depends | Estimate |
|---|---|---|---|---:|
| [M-001](./M-001-stripe-wiring.md) | Stripe wiring (cartão + Pix BR + Apple Pay) | needs-decisions | M-000 | 5d |
| [M-002](./M-002-credits-model.md) | Credits model in DB + uso extra com cap | needs-decisions | M-001 | 4d |
| [M-003](./M-003-free-tier.md) | Free tier setup | needs-decisions | M-002 | 1d |
| [M-004](./M-004-usage-page.md) | `/usage` page (Claude-style) | ready | M-002 | 4d |

## Sprint 1.5 — Notifications + Support

| ID | Título | Status | Depends | Estimate |
|---|---|---|---|---:|
| [M-005](./M-005-notifications.md) | Notification system (Realtime + email + bell) | needs-decisions | M-000 | 5d |
| [M-006](./M-006-support-chatbot.md) | Support chatbot (FAQ + refunds + plan changes) | needs-decisions | M-005, M-007 | 6d |
| [M-007](./M-007-auto-refund.md) | Auto-refund + anti-fraud safeguards | needs-decisions | M-001 | 4d |
| [M-008](./M-008-support-escalation.md) | Support escalation + admin queue (SLA + priority) | needs-decisions | M-005, M-006 | 5d |
| [M-009](./M-009-post-sale.md) | Post-sale lifecycle (welcome / check-in / NPS) | needs-decisions | M-005 | 3d |
| [M-010](./M-010-affiliate-integration.md) | Affiliate lifecycle notifications | needs-decisions | M-005, M-008 | 2d |

## Sprint 2 — Admin tooling

| ID | Título | Status | Depends | Estimate |
|---|---|---|---|---:|
| [M-011](./M-011-reset-usage.md) | Reset usage (individual + bulk) | ready | M-002 | 2d |
| [M-012](./M-012-credit-donations.md) | Credit donations (admin → user) | ready | M-002, M-005 | 3d |
| [M-013](./M-013-custom-plans.md) | Custom plans (owner full / admin 30%) | ready | M-001, M-002 | 3d |
| [M-014](./M-014-coupons.md) | Coupons (all types) | needs-decisions | M-001 | 4d |
| [M-015](./M-015-finance-dashboard.md) | Finance dashboard (revenue × cost × margin) | needs-decisions | M-001, M-002 | 5d |

## Sprint 3 — Polish

| ID | Título | Status | Depends | Estimate |
|---|---|---|---|---:|
| [M-016](./M-016-mfa-recovery-codes.md) | MFA recovery codes + lost-phone UI | ready | — | 3d |
| [M-017](./M-017-enduser-2fa.md) | End-user optional 2FA | ready | — | 2d |
| [M-018](./M-018-admin-redesign.md) | Admin redesign (layout + user mgmt) | needs-decisions | — | 5d |
| [M-019](./M-019-sales-page.md) | Sales page redo (apps/web + apps/app upgrade) | needs-decisions | — | 4d |

## Total estimate

~71 dev-days (2 devs em paralelo ≈ 7-8 semanas, com buffer e revisão)

## Recommended attack order

1. **Foundations week:** M-000
2. **Revenue foundations (parallel):** M-001 + M-005 + M-016
3. **Build the loop:** M-002 → M-003 → M-004 → M-007 → M-011
4. **Support layer:** M-006 + M-008 + M-009 + M-010
5. **Admin tooling:** M-012 + M-013 + M-014 + M-015
6. **Polish:** M-017 + M-018 + M-019

## How to use these cards

1. Pick a card with `status: ready`
2. Open the file, read **Scope** + **Acceptance criteria**
3. If `needs-decisions`, resolve them in the roadmap doc first
4. Implement, write tests, update docs
5. Mark `status: done` in the card frontmatter when merged
