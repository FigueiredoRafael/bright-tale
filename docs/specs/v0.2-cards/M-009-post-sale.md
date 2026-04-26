---
id: M-009
title: Post-sale lifecycle (welcome / check-in / NPS / churn)
status: ready
sprint: S1.5
depends-on: [M-005]
estimate: 3d
defaults-applied: 2026-04-25
---

> **[autopilot defaults]** Triggers: ligar todos (welcome / wizard / check-in 7d / churn warning 14d / NPS 30d / aniversário 1m+6m+1y). Health score: ligar (engagement 40% + NPS 30% + tickets 30%).

# M-009 — Post-sale lifecycle

Workflow automático após primeiro pagamento: boas-vindas, onboarding wizard,
check-ins, NPS, alertas de churn.

## Decisões pendentes (§S1.5)

- ⚠️ **Triggers — quais ligar:** todos os 6 sugeridos? (welcome / wizard / check-in 7d / churn N dias / NPS / aniversário)
- ⚠️ **Health score:** ligar agora ou diferir?
- ⚠️ Janelas: check-in N dias, churn warning N dias, NPS após M dias

## Scope sugerido (default: ligar todos)

- **Schema:**
  ```sql
  user_lifecycle_events (id, user_id, event_type, fired_at, payload)
  user_health_score (user_id, score, factors_jsonb, updated_at)
  ```
- **Trigger logic:**
  - Stripe webhook `checkout.session.completed` (primeira vez) → schedule welcome email + 7d check-in + 30d NPS
  - Cron diário: detecta inatividade > 14d → churn warning notification (M-005)
  - Aniversário do plano: 1m, 6m, 1y após signup
- **Health score** (calculado diariamente):
  - Engagement (jobs últimos 30d) — 40%
  - NPS recente — 30%
  - Tickets de suporte/refund — 30%
- **Onboarding wizard** (1ª sessão após primeiro pagamento):
  - Pergunta: stack? canal? estilo? tom?
  - Salva em `user_profile_preferences`
  - Pula se já preencheu

## Acceptance criteria

- [ ] Welcome email enviado após primeiro pagamento via Resend
- [ ] Wizard aparece na 1ª sessão pós-pagamento
- [ ] Cron de churn rodando
- [ ] Health score calculado diariamente
- [ ] Admin vê score na ficha do user (M-018)

## Files

- `supabase/migrations/{ts}_lifecycle.sql` (new)
- `apps/api/src/routes/internal/lifecycle-cron.ts` (new)
- `apps/api/src/lib/lifecycle/*` (new)
- `apps/app/src/components/onboarding/Wizard.tsx` (new)
- `apps/api/src/lib/email/templates/welcome.tsx` (new)

## Out of scope

- ML-based churn prediction (regra simples basta)
- Inbox campaigns (Mailchimp etc.)
