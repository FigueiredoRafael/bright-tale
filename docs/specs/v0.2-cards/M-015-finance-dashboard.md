---
id: M-015
title: Finance dashboard (revenue × cost × margin)
status: needs-decisions
sprint: S2
depends-on: [M-001, M-002]
estimate: 5d
---

# M-015 — Finance dashboard

Página `/admin/finance` com gráficos USD: receita, custo de operação,
margem, top 10 users caros, custo por provider, MRR/ARR waterfall.

## Decisões pendentes (§S2.5)

- ⚠️ Thresholds verde/amarelo/vermelho da margem (sugestão: > 40% verde, 20-40% amarelo, < 20% vermelho)
- ⚠️ Quais charts incluir (sugestão: todos)
- ⚠️ Granularidade (sugestão: todas — plano, user, org, país, afiliado)
- ⚠️ Alertas proativos (sugestão: ligar todos)
- ⚠️ Quem vê (sugestão: `owner` + role nova `billing`)
- ⚠️ Cotação USD (sugestão: usar valores em USD que Stripe já entrega — sem FX próprio)

## Scope sugerido (assume "tudo ligado")

- **Compute layer:**
  - View materializada `mv_finance_daily` (refresh hourly)
  - Colunas: date, plan, country, affiliate_id, revenue_usd, cost_usd, refunds_usd, ...
  - Custo: join com `token_transactions` × tabela de custo (vinda do `pricing-projections.md`)
- **API:**
  - `GET /api/admin/finance/summary?from&to&groupBy` — KPIs
  - `GET /api/admin/finance/series?metric&groupBy&from&to` — time-series
  - `GET /api/admin/finance/top-cost-users?limit` — top N
  - `POST /api/admin/finance/export.csv` — export
- **UI charts:** Recharts (já no projeto?) ou Tremor
  - Linha: receita vs custo (30/90/365d)
  - Área: margem ao longo do tempo
  - Barras: top 10 users mais caros
  - Pizza: custo por provider AI
  - Waterfall: MRR (novo + expansão − churn)
- **Alertas:** cron diário detecta:
  - Users no preju (custo > receita do plano)
  - Provider AI > $X no dia
  - Refund rate > Y% do mês
  - Churn rate > Z%
- **Export:** CSV + relatório mensal automático por email pro `owner`

## Acceptance criteria

- [ ] MV `mv_finance_daily` populado e refreshed
- [ ] Página `/admin/finance` carrega < 2s
- [ ] Charts interativos
- [ ] Drilldown: clicar barra do "top 10 users" → ficha do user
- [ ] Export CSV funciona
- [ ] Alertas disparam notificação (M-005)

## Files

- `supabase/migrations/{ts}_finance_mv.sql` (new)
- `apps/web/src/app/zadmin/(protected)/finance/*` (new)
- `apps/api/src/routes/admin/finance.ts` (new)
- `apps/api/src/routes/internal/finance-cron.ts` (new)

## Out of scope

- Cohort analysis avançado
- Prediction (LTV / CAC modelado)
