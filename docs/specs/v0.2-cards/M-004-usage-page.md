---
id: M-004
title: /usage page (Claude-style)
status: ready
sprint: S1
depends-on: [M-002]
estimate: 4d
---

# M-004 — Usage page

Página `/usage` no `apps/app` mostrando consumo de tokens em tempo quase-real.

## Decisões fechadas

- Componentes: barras de sessão atual + por categoria (texto/imagem/áudio/vídeo) + mensal + transações + botão refresh + toggle uso extra.
- Quem vê: o próprio user **e** admins do org (B2B/team).
- Reset visível: ambos (sessão + mensal).

## Scope

- **Page:** `apps/app/src/app/(authenticated)/usage/page.tsx`
- **API:**
  - `GET /api/tokens/balance` — retorna saldo + categorias + reset times
  - `GET /api/tokens/transactions?limit=50&offset=0` — histórico paginado
  - `POST /api/tokens/extra-toggle` — habilita/desabilita uso extra (com cap)
- **Components:**
  - `<UsageBar label total used resetAt />`
  - `<TransactionRow tx />`
  - `<ExtraUsageToggle enabled cap onChange />`
- **Real-time:** Supabase Realtime na tabela `user_token_balance` pra updates sem refresh manual

## Acceptance criteria

- [ ] User vê suas barras corretas
- [ ] Admin do org vê suas próprias barras + lista de members do org com drill-down
- [ ] Toggle uso extra abre modal pra setar cap (USD ou tokens)
- [ ] Histórico carrega + paginação infinita
- [ ] Atualização real-time via Supabase Realtime quando consome
- [ ] Test E2E: gerar conteúdo → barra atualiza sem refresh

## Files

- `apps/app/src/app/(authenticated)/usage/*` (new)
- `apps/app/src/components/usage/*` (new)
- `apps/api/src/routes/tokens/*` (extend M-002)

## Out of scope

- Notificações de "X% restante" → M-005
- Top-up button (manda pra M-001 checkout) — só botão, lógica em M-002
