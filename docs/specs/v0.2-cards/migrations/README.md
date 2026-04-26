# V0.2 Migrations — Apply Manually

These SQL files are the **proposed migrations** for v0.2 cards. They live
here (not in `supabase/migrations/`) because the `.claude/hooks/anti-leak.sh`
hook blocks direct agent writes to the migrations folder — by design,
"Claude must propose, user applies".

## How to apply

**Option A — copy into supabase/migrations/ (preferred for git tracking):**

```bash
# Pick the migration file you want to apply
cp docs/specs/v0.2-cards/migrations/20260425190000_extra_usage_and_signup_bonus.sql \
   supabase/migrations/

# Push to remote (uses npm script that runs `supabase db push`)
npm run db:push:dev   # or db:push:prod

# Regenerate TypeScript types
npm run db:types
```

**Option B — paste directly in Supabase SQL Editor:**

1. Open Supabase dashboard → SQL Editor → New query
2. Copy the SQL block from the migration file
3. Run
4. Locally: `npm run db:types` to regenerate types

## File order

Apply in this order (each builds on the previous):

| # | File | Card | Purpose |
|---|---|---|---|
| 1 | `20260425190000_extra_usage_and_signup_bonus.sql` | M-002 + M-003 | extra-usage cap + free tier signup bonus |
| 2 | `20260425200000_notifications.sql` | M-005 | notifications + preferences + RLS |
| 3 | `20260425210000_support_threads.sql` | M-006 + M-008 | chatbot threads + messages + escalation queue |
| 4 | `20260425220000_refund_audit.sql` | M-007 | auto-refund audit + config |
| 5 | `20260425230000_token_reset_audit.sql` | M-011 | reset audit + role permissions |
| 6 | `20260425240000_token_donations.sql` | M-012 | donations + approval flow |
| 7 | `20260425250000_custom_plans.sql` | M-013 | custom plans + user/org overrides |
| 8 | `20260425260000_custom_coupons.sql` | M-014 | custom credit-grant coupons |
| 9 | `20260425270000_lifecycle_events.sql` | M-009 | post-sale lifecycle + health score |
| 10 | `20260425280000_mfa_recovery.sql` | M-016 | MFA recovery codes + lost-phone requests |
| 11 | `20260425290000_finance_mv.sql` | M-015 | finance dashboard materialized view |

## After applying

For each batch, also do:

1. `npm run db:types` — regenerates `packages/shared/src/types/database.ts`
2. Commit the regenerated types alongside the migration copy
3. Tell Claude "migrations N → M applied" and Claude can proceed with implementation

## Safety

All migrations are idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
You can re-run any of them safely. The trigger functions use
`CREATE OR REPLACE` so re-applying overwrites cleanly.
