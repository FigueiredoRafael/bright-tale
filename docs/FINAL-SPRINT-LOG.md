# Sprint Log — v0.2 Monetization Cards

**Branch:** `feat/v0.2-monetization-cards`
**Date:** 2026-05-12
**Mode:** Autopilot (user sleeping)

---

## Completed

### M-011 — Reset Usage (full)
- API: `POST /api/zadmin/users/[id]/reset-tokens` — zeros `credits_used` + `credits_addon`, writes to `token_reset_audit`
- UI: `UserResetTokensModal` in users table action menu
- Sends `tokens_reset` notification to user

### M-012 — Credit Donations (full)
- API: `GET/POST /api/zadmin/donations`, `POST .../[id]/approve`, `POST .../[id]/deny`
- Auto-execute ≤1000 tokens; >1000 → `pending_approval` queue
- UI: full `DonationsClient` with KPI cards, filter tabs, approve/deny/expand rows
- `UserDonateModal` accessible from users table action menu
- Notifications: `donation_received` or `donation_pending_approval` on create; `donation_received` on approve

### M-014 — Coupons (full)
- API: `GET/POST /api/zadmin/coupons` (credit_grant type), `POST .../[id]/archive`
- Validation: uppercase code `/^[A-Z0-9_-]+$/`, 409 on duplicate
- UI: `CouponsClient` with create form, copy-to-clipboard, archive

### M-005 — Notifications (full)
- Server: `apps/web/src/lib/notify.ts` — `notify()` + `notifyMany()` helpers using `createAdminClient`
- App Bell: `apps/app/src/components/notifications/Bell.tsx` — dropdown with badge, Realtime subscription, mark-read
- App page: `apps/app/src/app/[locale]/(app)/notifications/page.tsx` — full list with all/unread filter
- Bell added to `Topbar.tsx` between workflow button and locale switcher
- `sbAny` cast workaround pending `npm run db:types` regen

### M-008 — Support (functional scaffold)
- Upgraded from `ComingSoon` to full server-rendered page reading `support_threads`
- SLA breach highlighting, priority badges (P0–P3), KPI cards

### M-007 — Refunds (scaffold)
- Shows `refund_audit` table with anti-fraud rules documentation
- TODOs for Stripe auto-refund execution

### M-013 — Plans (scaffold)
- Shows standard plans + `custom_plans` table
- TODOs for Stripe price creation

### M-015 — Finance (scaffold)
- Shows `credit_usage` count + MRR/revenue chart placeholders
- "Requires Stripe (M-001)" badges throughout

### M-001 — Stripe Webhook (scaffold)
- `apps/web/src/app/api/zadmin/stripe/webhook/route.ts`
- Full TODO block for `checkout.session.completed`, `invoice.payment_succeeded`, `charge.refunded`

---

## Migrations Applied (supabase/migrations/)

| File | Description |
|------|-------------|
| `20260501100000_extra_usage_and_signup_bonus.sql` | M-002/M-003: signup_bonus, free tier columns |
| `20260501110000_notifications.sql` | M-005: notifications table |
| `20260501120000_support_threads.sql` | M-008: support_threads + messages |
| `20260501130000_refund_audit.sql` | M-007: refund_audit table |
| `20260501140000_token_reset_audit.sql` | M-011: token_reset_audit table |
| `20260501150000_token_donations.sql` | M-012: token_donations table |
| `20260501160000_custom_plans.sql` | M-013: custom_plans table |
| `20260501170000_custom_coupons.sql` | M-014: custom_coupons table |
| `20260501180000_lifecycle_events.sql` | M-009: lifecycle_events table |
| `20260501190000_mfa_recovery.sql` | M-016: mfa_recovery_codes table |
| `20260501200000_finance_mv.sql` | M-015: finance_summary view |

---

## Remaining / Blocked

| Card | Status | Blocker |
|------|--------|---------|
| M-001 | Scaffold ✓ | Stripe keys (STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET) |
| M-003 | Migration ✓ | UI not built (free tier signup flow) |
| M-004 | — | Usage page `/usage` UI not built |
| M-006 | — | Chatbot UI — needs M-007 + Stripe for auto-refund |
| M-007 | Scaffold ✓ | Stripe keys |
| M-013 | Scaffold ✓ | Stripe keys |
| M-015 | Scaffold ✓ | Stripe keys + real revenue data |
| M-016 | Migration ✓ | MFA recovery codes UI not built |
| db:types | — | Regenerate after Stripe migrations land; `sbAny` cast is temporary workaround |

---

## Conservative Choices Made (Autopilot)

- **fetch-then-update** for `credits_addon` increment (not atomic RPC) — acceptable for low-frequency admin ops
- **`as any` cast** for Supabase client on new tables — avoids regenerating types during autopilot session
- **scaffold pages** for Stripe-dependent features instead of leaving as ComingSoon — gives Rafael something to review and context for the TODOs
- **no push** — branch stays local per convention
