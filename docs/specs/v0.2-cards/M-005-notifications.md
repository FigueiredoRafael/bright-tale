---
id: M-005
title: Notification system — Realtime + email + bell
status: ready
sprint: S1.5
depends-on: [M-000]
estimate: 5d
defaults-applied: 2026-04-25
---

> **[autopilot defaults]** TTL: 90 dias (cron limpa). Preferences granulares: incluir já no v0.2 (Settings → Notifications). Rate-limit broadcast: `admin` 1/hora, `owner` ilimitado.

# M-005 — Notification system

Sino no header com notificações em tempo real (Supabase Realtime) + email
fallback (Resend). Globais (broadcast) ou individuais.

## Decisões fechadas

- Casos: avisos de plano + doações + convites + anúncios + jobs assíncronos.
- Backend: Supabase Realtime.
- Email provider: Resend.
- Persistência: tabela `notifications`.
- Mandatórias (não desligáveis): pagamento falhou + segurança.
- UI: badge contador + dropdown + marcar lida/todas + página dedicada `/notifications`.
- Quem dispara globais: `owner` + `admin`.

## Decisões pendentes (§S1.4)

- ⚠️ TTL das notificações (sugestão: 90d)
- ⚠️ Preferências granulares por user (toggle por categoria/canal) — incluir no v0.2 ou diferir?
- ⚠️ Rate-limit pra broadcast global (sugestão: 1/hora pra `admin`, ilimitado pra `owner`)

## Scope

- **Schema:**
  ```sql
  notifications (
    id, user_id, type, title, body, action_url,
    is_read, read_at, sent_via_email, sent_via_push,
    created_at, expires_at
  )
  notification_preferences (user_id, category, email_enabled, push_enabled)
  ```
- **Producer API (server-side):**
  - `notify(userId, type, payload, channels=['push','email'])`
  - `notifyMany(userIds, ...)` para broadcast
  - `notifyAll(...)` para "todos os users" (RPC com SECURITY DEFINER, restrita a owner/admin)
- **Realtime:** subscription do client em `notifications` filtrado por `user_id = auth.uid()`
- **Email templates** em React Email (compatível com Resend)
- **Sino UI:** dropdown com lista + "marcar todas" + paginação
- **Página `/notifications`** com filtro + paginação + busca

## Acceptance criteria

- [ ] Migration + RLS (user vê só suas notifs)
- [ ] `notify()` server-side helper
- [ ] WebSocket atualiza badge sem refresh
- [ ] Email enviado via Resend quando user offline > 5 min
- [ ] Test: notificação criada → user online recebe instantaneamente
- [ ] Test: user offline → email enviado após delay
- [ ] Cron limpa notifs expiradas

## Files

- `supabase/migrations/{ts}_notifications.sql` (new)
- `apps/api/src/lib/notify/*` (new)
- `apps/app/src/components/notifications/Bell.tsx` (new)
- `apps/app/src/app/(authenticated)/notifications/page.tsx` (new)
- `apps/api/src/lib/email/templates/*` (new)

## Out of scope

- SMS push (separado, se aprovado depois)
- Mobile push notifications
