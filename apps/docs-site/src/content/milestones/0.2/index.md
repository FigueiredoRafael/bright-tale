# v0.2 — Launch (beta)

_Target: sem deadline fixo. Dogfooding interno + 1 convite._

Status: **Beta** — em desenvolvimento.

## Objetivo

Estabilizar o produto para uso diário real (Bright Curios blog + YouTube) e habilitar subscriptions pagas end-to-end.

## Cards — Pipeline & Content

> Specs originais: `docs/superpowers/specs/2026-04-20-*.md`

| Card | Nome | Prioridade | Dias | Status |
|---|---|---|---:|---|
| V2-001 | Validar `primaryKeyword` nos agentes | MUST | 1 | 🔲 |
| V2-002 | WP-per-channel + channel_members | MUST | 5 | 🔲 |
| V2-003 | Alt text on-publish (SEO) | MUST | 2 | 🔲 |
| V2-004 | WordPress publish e2e test | MUST | 2 | 🔲 |
| V2-005 | Affiliates V1 (catálogo + CSV + dropdown) | MUST | 4 | 🔲 |
| | **Subtotal pipeline** | | **14** | |

## Cards — Subscription-Ready

> Spec: `docs/superpowers/specs/2026-04-21-subscription-ready-design.md`

| Card | Nome | Prioridade | Dias | Status |
|---|---|---|---:|---|
| V2-006 | Credits hold/reserve + FOR UPDATE (race fix) | MUST | 3 | 🔲 |
| V2-007 | Stripe Products/Prices setup + env wiring | MUST | 1 | 🔲 |
| V2-008 | Checkout → webhook → credit grant e2e validation | MUST | 2 | 🔲 |
| V2-009 | Billing settings page (plan + credits + Portal) | MUST | 2 | 🔲 |
| | **Subtotal subscription** | | **8** | |

| | **Total estimado v0.2** | | **22** | |

## Dependências entre cards

```
V2-001 (primaryKeyword) → V2-003 (alt text)
V2-006 (credits race) → V2-008 (e2e checkout validation)
V2-007 (Stripe setup) → V2-008 (e2e checkout validation)
V2-008 (e2e validation) → V2-009 (billing settings page)
```

## Cortado (pós-launch)

- Kanban board interno
- Autopilot evoluído (retry adaptativo, telemetria, drawer)
- Assets fast ingest
- pgvector + engine AI de afiliados
- GitHub Actions / CI
- Playwright E2E completo
- PostHog events
- Video editor + FFmpeg worker
- YouTube upload OAuth
- Mercado Pago / PIX / boleto
- Trials (Free tier é o trial)
- Enterprise tier
- Rich in-app billing (Stripe Portal cobre)

## Legenda

| Status | Significado |
|---|---|
| 🔲 | Não iniciado |
| 🟡 | Em progresso |
| ✅ | Concluído |
| ⛔ | Bloqueado |
