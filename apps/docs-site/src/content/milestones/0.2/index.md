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

## Cards — Segurança

> Trilha criada 2026-04-23 após pentest inicial. Baseline: `reports/history/001-initial-baseline.html` (49 findings, 2 crit, 17 high). Estado atual: `reports/history/003-after-crown-jewel-fix.html` (21 findings, 1 crit, 3 high). Dashboard: `reports/history.html`.

### Fixes já aplicados (iterations 001 → 003)

| Fix | Findings fechados | Arquivo(s) |
|---|---|---|
| **Crown-jewel leak** — `/api/agents` exigia só `INTERNAL_API_KEY`; proxy sempre injeta, então endpoint servia 272 KB de prompts sem sessão | 1 CRIT | `apps/api/src/middleware/authenticate.ts` (novo `authenticateWithUser`), `apps/api/src/routes/agents.ts` |
| Security headers (CSP, HSTS, X-CTO, X-Frame, Referrer, Permissions) em 3001 + 3002 | 6 MED | `apps/api/src/index.ts` (Fastify `onSend` hook), `apps/web/next.config.ts` |
| X-Powered-By removido | 1 INFO | `apps/web/next.config.ts` (`poweredByHeader: false`) |
| Origin check em POST/PUT/PATCH/DELETE (CSRF defense in depth) | 2 MED | `apps/api/src/index.ts` (`onRequest` hook) |
| Constant-time compare da `INTERNAL_API_KEY` | timing attack surface | `apps/api/src/middleware/authenticate.ts` (`crypto.timingSafeEqual`) |
| Gitleaks false positives em `.env.example`, test files, docs/plans | 14 HIGH (FP) | `.gitleaks.toml` allowlist |
| Cache-Control: no-store nas rotas `/admin/*` | defense in depth | `apps/web/next.config.ts` (per-route headers) |
| Hook anti-leak em `.claude/settings.json` (bloqueia Write/Edit em .env*, secrets) | preventivo | `.claude/hooks/anti-leak.sh` + `.claude/settings.json` |

### Cards abertos (bloqueados por refactor arquitetural)

| Card | Nome | Prioridade | Pts | Status | Spec |
|---|---|---|---:|---|---|
| SEC-001 | User login hardening (constant-time + rate-limit + HIBP + Turnstile) | MUST | 5–8 | 🔲 | `docs/security/SEC-001-login-hardening.md` |
| **SEC-002** | **Admin MFA + AAL2 gate + short JWT + rate-limit** — _prioridade máxima, cobre 1 CRIT + 1 HIGH_ | MUST | 8–13 | 🔲 | `docs/security/SEC-002-admin-hardening.md` |
| SEC-003 | Agent prompts crown-jewel (AES-GCM + AAD + audit log + step-up MFA em writes) | MUST | 13–21 | 🔲 | `docs/security/SEC-003-agent-prompts-protection.md` |
| SEC-004 | Auditoria de auth das ~175 rotas restantes em apps/api | MUST | 5–8 | 🔲 | `docs/security/SEC-004-route-auth-audit.md` |
| SEC-005 | Polish: slug rotation, reset-password uniformity, error envelope, probe refinements | SHOULD | 5 | 🔲 | `docs/security/SEC-005-polish.md` |
| | **Subtotal segurança** | | **36–55** | |

### Dependências internas de segurança

```
SEC-001 ─┬─> SEC-002 (shared rate-limit infra)
         └─> SEC-003 (precisa da AAL2 criada em SEC-002 pra step-up em writes)
SEC-002 ────> SEC-003
SEC-003 ────> SEC-004 (usa o mesmo padrão authenticateWithUser)
```

SEC-002 é o card mais urgente — sem ele, uma senha de admin interceptada/phishada = takeover total do painel (users, orgs, prompts, affiliates, payouts).

| | **Total estimado v0.2** | | **58–77** | |

## Dependências entre cards

```
V2-001 (primaryKeyword) → V2-003 (alt text)
V2-006 (credits race) → V2-008 (e2e checkout validation)
V2-007 (Stripe setup) → V2-008 (e2e checkout validation)
V2-008 (e2e validation) → V2-009 (billing settings page)
SEC-001 → SEC-002 → SEC-003 → SEC-004
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
