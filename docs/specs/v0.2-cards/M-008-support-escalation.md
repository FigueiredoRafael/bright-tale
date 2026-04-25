---
id: M-008
title: Support escalation + admin queue (priority + SLA)
status: ready
sprint: S1.5
depends-on: [M-005, M-006]
estimate: 5d
---

# M-008 — Support escalation

Quando bot escala, ticket entra em fila `/admin/support` ordenada por SLA +
prioridade. Time pega ticket, SLA tracking, breach alerts.

## Decisões fechadas

- **Alerta:** sino (M-005) pra admins/support + fila dedicada + email pra `support@brighttale.com.br`.
- **Priority:** P0/P1/P2/P3 (configurável os critérios).
- **SLA:** configurável por prioridade (defaults: P0=15min, P1=2h, P2=8h, P3=24h).
- **Fila:** ordenação mix prioridade + SLA-restante (peso configurável).
- **SLA breach:** highlight vermelho + notifica owner + auto-escala a cada N% do SLA.
- **Contexto bundle:** resumo conversa + plano/tokens + últimos 5 jobs + histórico tickets + afiliado + health score.
- **Quem atende:** `support` é primária; admin/owner veem; sem round-robin (cherry-pick).
- **Status:** `open → in_progress → waiting_user → resolved → closed`. Reabertura permitida em até N dias (configurável, sugestão 14d).

## Scope

- **Tabelas** (estende M-006 `support_threads`):
  ```sql
  ALTER TABLE support_threads ADD priority text;  -- P0..P3
  ALTER TABLE support_threads ADD sla_due_at timestamptz;
  ALTER TABLE support_threads ADD breach_at timestamptz;
  ALTER TABLE support_threads ADD assignee_id uuid;  -- null = unclaimed
  
  support_config (key text PK, value jsonb)
  -- defaults: sla_p0_minutes=15, sla_p1_hours=2, ...
  ```
- **Admin UI:**
  - `/admin/support` — fila com colunas: prioridade, SLA, idade, user, último msg, status
  - Click → drawer com bundle de contexto + chat completo + actions (claim, reply, resolve, reassign, escalate)
- **Background jobs:**
  - Cron 1min: marca breach_at quando SLA expira; notifica owner; auto-escala se config diz
- **Settings UI:** `/admin/settings/support` — admin/owner edita SLAs e thresholds

## Acceptance criteria

- [ ] Migration + RLS (`support` role + admins acessam)
- [ ] Fila ordena correto
- [ ] SLA breach gera notificação + highlight
- [ ] Auto-escala P3→P2 ao atingir 50% SLA (configurável)
- [ ] Bundle de contexto pré-carregado funciona
- [ ] Test E2E: bot escala → ticket aparece na fila → admin pega → resolve

## Files

- `supabase/migrations/{ts}_support_escalation.sql` (new)
- `apps/web/src/app/zadmin/(protected)/support/*` (new)
- `apps/api/src/lib/support/sla.ts` (new)
- `apps/api/src/routes/internal/sla-cron.ts` (new)
- `apps/web/src/app/zadmin/(protected)/settings/support/*` (new)

## Out of scope

- Round-robin assignment (manual cherry-pick é OK pra v0.2)
- Métricas avançadas (tempo médio resolução etc.) → vai pro M-015 finance dashboard
