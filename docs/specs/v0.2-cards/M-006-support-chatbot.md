---
id: M-006
title: Support chatbot — FAQ + refunds + plan changes
status: needs-decisions
sprint: S1.5
depends-on: [M-005, M-007]
estimate: 6d
---

# M-006 — Support chatbot

Bot AI no `apps/app` que resolve dúvidas comuns + processa refunds (M-007)
+ trocas de plano + reset de senha + cancelamento.

## Decisões fechadas

- **Resolve sozinho:** FAQ, refunds (M-007), trocas de plano, reset senha/2FA, cancelamento.
- **Cancelamento:** cria ticket P1 pra admin + afiliado tentar reverter (save flow).
- **Histórico:** persistir tudo, user retoma, admin vê na escalação.
- **Escala pra humano sempre:** refunds fora política, disputas, "falar com humano", N tentativas (configurável, padrão 7).

## Decisões pendentes (§S1.5)

- ⚠️ **Stack do bot** — usuário pediu "menor custo + consistência":
  - Recomendação: **Anthropic Claude com tools** (mesma família dos agents BC_*, Haiku 4.5 é mais barato), expor `/api/support/chat` com tools customizadas (cancel_subscription, request_refund, reset_password, lookup_plan, escalate).
  - Alternativa: Crisp/Intercom = simples mas mensalidade fixa cara.
- ⚠️ Bug reports técnicos resolvidos pelo bot ou sempre escalam? (recomendo: bot coleta info + escala P2)

## Scope

- **Schema:**
  ```sql
  support_threads (id, user_id, status, priority, tags, created_at, last_message_at, escalated_at, resolved_at)
  support_messages (id, thread_id, role, content, tool_calls, created_at)
  -- role: user | assistant | tool | human_agent
  ```
- **API:**
  - `POST /api/support/chat` — envia mensagem, retorna resposta (streaming)
  - `GET /api/support/threads` — lista do user
  - `POST /api/support/escalate` — força escalação manual
- **Tools do bot:**
  - `lookup_user_plan()` → retorna plano + tokens + última cobrança
  - `request_refund(reason, amount)` → chama M-007 logic
  - `cancel_subscription(at_period_end)` → Stripe API
  - `change_plan(target)` → cria checkout pra upgrade ou schedule downgrade
  - `escalate(priority, reason)` → cria ticket P0–P3 (M-008)
- **System prompt** com guidelines (tom, política de refund, quando escalar)
- **UI:** widget de chat no canto + página `/support` com lista de threads

## Acceptance criteria

- [ ] User envia mensagem → bot responde com tool calls
- [ ] Após 7 mensagens sem resolver → auto-escala (configurável)
- [ ] Test: bot tenta refund → chama M-007
- [ ] Test: cancelamento aciona ticket high + notifica afiliado (M-010)
- [ ] Logs sanitizados (sem exposing PII no log)

## Files

- `apps/app/src/components/support/ChatWidget.tsx` (new)
- `apps/app/src/app/(authenticated)/support/*` (new)
- `apps/api/src/routes/support/chat.ts` (new)
- `apps/api/src/lib/support/tools/*` (new)
- `supabase/migrations/{ts}_support.sql` (new)

## Out of scope

- Voz (audio chat)
- Multi-language (start pt-BR, EN depois)
