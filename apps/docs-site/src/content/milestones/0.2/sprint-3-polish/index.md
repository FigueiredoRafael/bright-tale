# Sprint 3 — Polish

**Objetivo:** MFA mais seguro (recovery codes), 2FA opcional pro user, redesign do admin, refazer páginas de venda.

**Specs:** [`docs/specs/v0.2-cards/`](https://github.com/FigueiredoRafael/bright-tale/tree/staging/docs/specs/v0.2-cards) (cards M-016 → M-019)

**Depende de:** nada (cards independentes — podem rodar em paralelo aos outros sprints)

**Progresso:** 1/4 implementados (M-017 ✅; M-018 sidebar parcial)

---

## Cards

### M-016 — MFA recovery codes + lost-phone UI

🔲 **Status:** ready (autopilot defaults)

**Defaults aplicados:**
- Recovery codes: SIM (10 códigos one-shot Argon2id-hashed na enrollment)
- Lost-phone UI: SIM (admin A pede destravamento, admin B aprova com seu MFA)
- Auto-unenroll após N falhas: NÃO (vira DoS fácil contra admin)

**Schema:** `mfa_recovery_codes` + `mfa_unlock_requests`.

**Login flow alternativo:** `/admin/login/recovery-code` aceita 1 código → emite session AAL2 + força re-enroll.

**Estimate:** 3 dias

---

### M-017 — End-user optional 2FA (TOTP)

✅ **Status:** done (2026-04-25)

**Entregue:**
- Página `/settings/security` em `apps/app` com enroll / verify / disable
- Estados: loading | disabled | enrolling | enabled | error
- Limpa factors stale antes de re-enroll (evita dup do Supabase)
- Card "Segurança" no `/settings` index
- Sem AAL2 gate forçado — Supabase challenge só acontece se user enrollou

---

### M-018 — Admin redesign (layout + user mgmt clear)

🟡 **Status:** in-progress (sidebar entregue, redesign visual pendente)

**Entregue (parcial):**
- ✅ Sidebar expandida com 5 grupos (Principal / Gestão / Monetização / Operações / Sistema)
- ✅ Stub pages pros 6 destinos novos (Plans / Coupons / Donations / Support / Refunds / Finance)
- ✅ Settings page do admin (também stub)
- ✅ Componente `<ComingSoon />` reutilizável referenciando o card M-XXX

**Pendente:**
- Dashboard home com KPIs hero (MRR, MAU, ticket queue, churn rate) — pega do M-015
- User management revamp: drawer lateral em vez de modal, tabs (Profile / Tokens / Billing / Sessions / Tickets / Audit)
- Tabela de users com filtros server-side, ordenação, pesquisa, bulk actions
- Empty states com ilustração + CTA óbvio
- Loading states com skeleton
- Visual review pelo Rafael

**Estimate restante:** 3-4 dias

---

### M-019 — Sales page redo (apps/web + apps/app upgrade)

🔲 **Status:** ready

**Decisões fechadas (input do user):**
- Tirar placeholders, entregar promessas concretas tipo "25 blog posts SEO/mês com 1 plano"
- Roteiros pra YouTube como vertical clara
- Aplicar nas DUAS: apps/web (landing pública) e apps/app (upgrade page interno)

**Direção:**
- Hero promise + subhead com proof + CTA "Começar grátis (sem cartão)"
- Pricing table 4 planos (Free / Starter / Creator / Pro) com toggle mensal/anual + Apple/Google Pay icons
- Comparação direta com alternativas (freelancer, ChatGPT bruto)
- FAQ real (refunds, créditos, modelos, white-label)
- PostHog event "checkout_started" para conversion tracking

**Estimate:** 4 dias (UI-heavy)

---

## Sub-total

**14 dev-dias** (≈ 3 semanas com 1 dev). M-017 já entregue: **12 dev-dias restantes**.

## Dependências internas

```
M-016 (recovery codes) — independente, pode rodar em paralelo
M-017 ✅ done
M-018 (admin redesign) — visual; pode rodar em paralelo, mas algumas seções
                         dependem dos cards Sprint 1/2 pra ter dados reais
M-019 (sales page) ──> M-001 (Stripe checkout pra "Começar grátis" funcionar)
```
