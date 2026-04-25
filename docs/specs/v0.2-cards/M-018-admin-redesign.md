---
id: M-018
title: Admin redesign (layout moderno + user mgmt clear)
status: ready
sprint: S3
depends-on: []
estimate: 5d
---

# M-018 — Admin redesign

Layout do admin mais moderno (não cara de "feito de qualquer jeito") e
gestão de usuários menos confusa.

## Decisões fechadas (input do user)

- "Layout mais moderno e n pareça algo feito de qualquer jeito"
- "Gestão de users tá confusa"

## Latitude criativa

User aprovou amplo. Direção sugerida:

- **Design system unificado** — usar `shadcn/ui` consistente (já está no projeto), card-based layouts, dark mode default, accents do brand
- **Sidebar collapsible** com seções claras: Dashboard / Users / Orgs / Plans / Coupons / Donations / Refunds / Support / Finance / Settings
- **Dashboard home** com KPIs hero (MRR, MAU, ticket queue, churn rate) — leve, vai pegar do M-015
- **User management revamp:**
  - Tabela com filtros server-side, ordenação, pesquisa
  - Drawer lateral pra detalhes (não modal — mais espaço)
  - Tabs no drawer: Profile / Tokens / Billing / Sessions / Tickets / Audit
  - Bulk actions claro (checkbox + action bar fixa no topo)
- **Empty states** com ilustração + CTA óbvio
- **Loading states** com skeleton (não spinner genérico)

## Acceptance criteria

- [ ] Sidebar nova com todos os links organizados
- [ ] Dashboard home renderiza
- [ ] User detail drawer com tabs
- [ ] Tabela de users tem filtros + sort + bulk actions
- [ ] Mobile: sidebar vira drawer
- [ ] Visual review pelo user (você precisa ver e aprovar)

## Files

- `apps/web/src/app/zadmin/(protected)/layout.tsx` — refactor sidebar
- `apps/web/src/components/admin/*` (new design components)
- `apps/web/src/app/zadmin/(protected)/users/*` — refactor

## Out of scope

- Dark/light mode toggle (lock dark por agora)
- Multi-language admin (pt-BR só)
