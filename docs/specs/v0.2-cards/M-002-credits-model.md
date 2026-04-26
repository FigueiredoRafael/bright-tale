---
id: M-002
title: Credits model — DB, débito, uso extra com cap
status: ready
sprint: S1
depends-on: [M-001]
estimate: 4d
defaults-applied: 2026-04-25
---

> **[autopilot defaults]** Bloco de top-up: 1.000 tokens por $5 (1.5× preço efetivo do Starter — Starter $9 / 5k = $0.0018/token; extra $5 / 1.000 = $0.005/token).

# M-002 — Credits model

Schema de tokens no DB + lógica de débito por ação + uso extra (overage)
com **cap configurável** pra evitar inadimplência.

## Decisões fechadas

- **Refresh:** reset mensal (perde sobra) — alinhado com ciclo Stripe.
- **Pay-as-you-go:** opt-in toggle (igual Claude). Default: off.
- **Cap obrigatório:** quando user liga "uso extra", define teto em $ ou
  N tokens. Atinge teto → bloqueia até próximo ciclo OU upgrade. Isso evita
  user gastar 500 tokens extras, sair, e ficar devendo.
- **Granularidade extra:** por bloco (ex.: 1.000 tokens = $X). Igual ElevenLabs/Claude.

## Decisões pendentes (§S1.2)

- ⚠️ Preço do bloco extra: $/1.000 tokens? (sugestão: 1.5× preço efetivo do plano)
- ⚠️ Tamanho do bloco: 1.000? 5.000?

## Scope

- **Schema:**
  ```sql
  user_token_balance (user_id, plan_tokens, extra_tokens, period_start, period_end)
  token_transactions (id, user_id, kind, amount, action, metadata, created_at)
  -- kind: grant_plan | grant_topup | grant_donation | grant_coupon | spend | refund_revert
  user_extra_settings (user_id, enabled, cap_usd, cap_tokens)
  ```
- **API:**
  - `POST /api/internal/tokens/spend` (chamada por agentes/jobs) — atomic
  - `GET /api/tokens/balance` (UI consume)
  - `POST /api/tokens/topup` — cria Stripe Checkout pra top-up
- **Lógica de débito:**
  - Tenta debitar de `plan_tokens` primeiro
  - Se zerou e `extra.enabled` + `cap não atingido` → debita do extra (tracked pra cobrar no fim do ciclo)
  - Se `cap atingido` ou `extra.disabled` → retorna `INSUFFICIENT_TOKENS`
- **Cobrança do extra:**
  - Acumula em `user_token_balance.extra_used_tokens`
  - No final do ciclo (Stripe webhook `invoice.upcoming`) cria invoice line
- **Cron:** mensal, reseta `plan_tokens` no `period_end` + zera `extra_used_tokens`

## Acceptance criteria

- [ ] Migration completa, RLS habilitado, GRANTs corretos
- [ ] Função `debit_tokens(user_id, action_kind, amount)` atomic via Postgres function
- [ ] Test: spend → balance correto
- [ ] Test: extra desativado → block com `INSUFFICIENT_TOKENS`
- [ ] Test: extra ativado + cap atingido → block
- [ ] Test: reset mensal limpa plan_tokens

## Files

- `supabase/migrations/{ts}_token_balance.sql` (new)
- `apps/api/src/routes/tokens/*` (new)
- `apps/api/src/lib/tokens/*` (new)
- `apps/api/src/lib/__tests__/tokens.test.ts`

## SQL ready-to-apply

> **Pre-existing system:** `organizations.credits_total/used/addon` + `credit_usage` table already exist. M-002 *extends* — does NOT rebuild. Schema below adds extra-usage fields + signup bonus.

Copy into `supabase/migrations/20260425190000_extra_usage_and_signup_bonus.sql`:

```sql
-- M-002 + M-003 — extra usage (pay-as-you-go opt-in com cap) + signup bonus.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS extra_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra_cap_usd_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_used_usd_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signup_bonus_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signup_bonus_expires_at timestamptz;

-- Single-row "config" for pricing knobs without code change.
CREATE TABLE IF NOT EXISTS public.pricing_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  extra_block_credits integer NOT NULL DEFAULT 1000,
  extra_block_price_usd_cents integer NOT NULL DEFAULT 500,
  free_tier_monthly_credits integer NOT NULL DEFAULT 500,
  free_tier_signup_bonus_credits integer NOT NULL DEFAULT 2000,
  free_tier_bonus_validity_days integer NOT NULL DEFAULT 7,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
INSERT INTO public.pricing_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.pricing_config TO authenticated, anon;
CREATE POLICY "pricing_config_read_all" ON public.pricing_config FOR SELECT USING (true);

-- Trigger: apply signup bonus on org INSERT (free tier).
CREATE OR REPLACE FUNCTION public.apply_signup_bonus()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg public.pricing_config;
BEGIN
  SELECT * INTO cfg FROM public.pricing_config WHERE id = true LIMIT 1;
  IF cfg IS NULL THEN RETURN NEW; END IF;

  IF NEW.credits_total = 0 OR NEW.credits_total = cfg.free_tier_monthly_credits THEN
    NEW.credits_total := cfg.free_tier_monthly_credits;
    NEW.signup_bonus_credits := cfg.free_tier_signup_bonus_credits;
    NEW.signup_bonus_expires_at := now() + (cfg.free_tier_bonus_validity_days || ' days')::interval;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_signup_bonus_trigger ON public.organizations;
CREATE TRIGGER apply_signup_bonus_trigger
  BEFORE INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.apply_signup_bonus();

CREATE INDEX IF NOT EXISTS idx_organizations_signup_bonus_expires_at
  ON public.organizations (signup_bonus_expires_at)
  WHERE signup_bonus_credits > 0;

COMMENT ON COLUMN public.organizations.extra_enabled IS
  'M-002: opt-in pay-as-you-go. When true and plan exhausted, debits go to extra_used_usd_cents (until cap).';
COMMENT ON COLUMN public.organizations.signup_bonus_credits IS
  'M-003: one-time bonus tokens (option C: 500/mo + 2000 bonus week 1).';
```

After applying, run `npm run db:types` to regenerate `packages/shared/src/types/database.ts` so TypeScript sees the new columns.

## Out of scope

- UI de balance (M-004)
- Notificações de "X% restante" (M-005)
- Donations (M-012)
