# Admin provisioning

How a person becomes an admin of the BrightTale platform.

## TL;DR

**There is no self-serve path.** Admin role must be granted by an
existing admin via a SQL `INSERT` into `user_roles`. This is intentional
— the admin surface is 2-person scale and never needs a signup UI.

## The contract

- `apps/web/src/lib/admin-check.ts` → `isAdminUser(supabase, userId)`
  reads `public.user_roles` where `role = 'admin'`. No fallback, no
  email-domain allowlist, no OAuth auto-grant.
- The admin login page (`/admin/login`) only exposes **email + password**
  sign-in. No signup form. No Google OAuth (removed in SEC-007).
- Password reset and forgot-password flows work for existing admins only;
  they never create accounts.
- Unauthenticated access to any `/admin/(protected)/*` route redirects
  to `/admin/login`. Authenticated-but-not-admin users go to
  `/admin/login?error=unauthorized`.

## How to add a new admin

> **Non-negotiable rule:** the new admin does NOT self-register. They
> never touch the user-facing signup page. An existing admin creates the
> account server-side, grants the role, and hands over the sign-in
> credentials via a trusted channel. This closes every "what if someone
> creates an account they shouldn't?" side channel.

### Option A — Supabase dashboard invite (recommended, 2 min)

1. Log in to **https://supabase.com/dashboard/project/\<project-id\>/auth/users**
2. Click **Add user** → **Send invitation**
3. Enter the new admin's email. Supabase emails them a magic link.
4. Copy the user's UUID once the invitation is sent (row appears
   immediately with status "Invited").
5. In the SQL editor, create the manager row:
   ```sql
   INSERT INTO public.managers (user_id, role, display_name, title, invited_by)
   VALUES (
     '<uuid-from-step-4>',
     'admin',                           -- or: 'owner', 'support', 'billing', 'readonly'
     'João Silva',                      -- display name for the /admin/managers UI
     'Co-founder',                      -- title (optional)
     auth.uid()                         -- your own user id, as the inviter
   );
   -- The trigger on `managers` auto-inserts an audit row in managers_audit_log.
   ```
6. The new admin clicks the emailed link → sets their own password →
   they're logged into the regular user app.
7. Now navigate them to `https://app.brighttale.io/<admin-slug>/login`
   and have them sign in again with the password they just set.
8. Middleware detects first-time-admin at AAL1 → redirects to
   `/<admin-slug>/mfa` → they scan the QR with their phone → session
   promoted to AAL2. Done.

### Option B — SQL-only (disconnected, no Supabase dashboard access)

Only if you have direct service-role SQL access and no dashboard.

1. Use the Supabase Auth admin API (via a trusted script) to create the
   user with a temporary password:
   ```ts
   // trusted machine, service-role client
   const { data, error } = await supabase.auth.admin.createUser({
     email: 'joao@example.com',
     password: generateTempPassword(),   // 20+ random chars
     email_confirm: true,                // skip confirmation email
   })
   ```
2. Note the returned `data.user.id`.
3. Grant role:
   ```sql
   INSERT INTO public.managers (user_id, role, display_name, title, invited_by)
   VALUES ('<uuid>', 'admin', 'Name', 'Title', '<your-uuid>');
   ```
4. Share the temp password via the team password manager (NEVER email,
   Slack, or chat).
5. First login → user goes to Supabase's forgot-password or the admin's
   reset flow to set their own password.
6. Same MFA enrollment as Option A step 8.

### Things this flow intentionally blocks

- Anyone going to `/auth/signup` on the user app never gets admin role,
  even if they share the email domain with an admin.
- No `/admin/signup` page exists or will be built.
- Google OAuth on `/admin/login` is removed (SEC-007). Even if a future
  developer re-wires it by accident, the server action returns an error
  and the CSS hides the button — two layers of defense.
- `user_roles` inserts require service-role DB access. `authenticated`
  and `anon` roles cannot INSERT/UPDATE/DELETE (RLS deny-all).

## Admin lost their phone / TOTP factor

No recovery codes are issued yet (that's SEC-001 scope). For now:

1. Another admin logs in.
2. In Supabase dashboard → **Authentication** → **Users** → find the user.
3. Open the user detail pane, scroll to **MFA factors**.
4. Click **Unenroll** next to their TOTP factor.
5. Alert the user: their next login lands on `/admin/mfa` again and they
   re-enroll from a new device.

If the admin who lost their phone is the ONLY admin:

1. You need service-role Supabase CLI access from a trusted machine.
2. Run:
   ```sql
   DELETE FROM auth.mfa_factors WHERE user_id = '<uuid>';
   ```
3. Log in again → re-enroll.

Harden this after SEC-001 ships recovery codes: each admin gets 10
one-shot Argon2id-hashed codes at enrollment; any one lets them log in
without the TOTP factor, then they re-enroll.

## Manager role gradations

The `managers.role` enum controls how much access each operator has:

| Role | What they can do |
|---|---|
| `owner` | Everything including managing other owners. Founders only. |
| `admin` | Full admin access; manage non-owner managers. Default for new admins. |
| `support` | Read customer data + trigger password reset / user support actions. |
| `billing` | Read + manage billing, payouts, affiliate approvals. |
| `readonly` | View-only admin area. Useful for advisors / auditors / contractors. |

Change a role later with:

```sql
UPDATE public.managers
   SET role = 'support'                      -- or any valid role
 WHERE user_id = '<uuid>';
-- Trigger logs the role_changed event automatically.
```

## How to revoke an admin (soft-delete, recommended)

```sql
UPDATE public.managers
   SET is_active = false,
       deactivated_at = now(),
       deactivated_by = '<your-uuid>',
       deactivation_reason = 'Left the team'
 WHERE user_id = '<uuid>';
```

Soft-deletion preserves the audit trail. The trigger emits a
`deactivated` event. The person keeps their `auth.users` row (so their
regular user account — if they had one — still works) but loses admin
access immediately on next middleware check.

## How to fully remove an admin

For cases where the manager row itself should disappear (e.g., a
mis-provisioned invite):

```sql
DELETE FROM public.managers WHERE user_id = '<uuid>';
-- Trigger emits a 'removed' event before the row is deleted.
```

Follow up by revoking any active sessions the revoked admin might hold:
Supabase dashboard → Authentication → Users → open user → "Sign out all
sessions".

## What the admin UI does NOT allow

| Action | Path | Why disabled |
|---|---|---|
| Signup on admin login page | — | No form exposed |
| Google OAuth on admin login | — | Removed in SEC-007 |
| Self-grant admin role | — | `isAdminUser` reads DB only |
| Role edit from admin panel | `/admin/users` | Read/view only for now; role mutations require direct SQL |

The intentional rough edge: role changes are SQL-only. When the admin
team grows to 3+ we revisit and either build a role-management UI (with
audit log + step-up MFA per SEC-003 pattern) or wire a Supabase admin
client call behind an already-AAL2 session.

## Onboarding checklist (copy + run for each new admin)

- [ ] Existing admin invited the user via **Supabase dashboard → Auth → Users → Add user → Send invitation** (NEVER via the public signup page)
- [ ] UUID captured from the invited-user row
- [ ] `INSERT INTO user_roles (user_id, role) VALUES (...)` run
- [ ] New admin opened the invitation email, set their password
- [ ] New admin pointed to `https://app.brighttale.io/<admin-slug>/login` (NOT the user app)
- [ ] First sign-in → redirected to `/<admin-slug>/mfa` (middleware AAL2 gate)
- [ ] TOTP enrolled (scanned QR with phone, verified 6-digit code)
- [ ] Sanity click-through: `/<admin-slug>/users`, `/<admin-slug>/orgs`, `/<admin-slug>/agents` all load
- [ ] Entry added to team password manager: slug URL + admin name + date added

## Onboarding checklist (copy + run for each new admin)

(Keeping the checklist at the bottom up to date with the managers
migration.)

- [ ] Invited via Supabase dashboard (Auth → Users → Add user → Send invitation)
- [ ] UUID captured
- [ ] `INSERT INTO public.managers (user_id, role, display_name, title, invited_by) VALUES (...)` run
- [ ] New manager opened the invitation email, set their password
- [ ] Pointed to `https://app.brighttale.com.br/<admin-slug>/login`
- [ ] First sign-in → redirected to `/<admin-slug>/mfa`
- [ ] TOTP enrolled (scanned QR, verified 6-digit code)
- [ ] Sanity click-through: `/<admin-slug>/managers`, `/<admin-slug>/users`, `/<admin-slug>/orgs`
- [ ] Entry added to team password manager: slug URL + manager name + date + role

## Future improvements (referenced in SEC cards)

- **SEC-008 (now)** — `managers` table with role gradation + audit log.
  This document. `user_roles` deprecated; remove in a follow-up migration
  once the managers table is stable for ≥1 sprint.
- **SEC-008.1 (follow-up)** — in-admin UI for role management (invite,
  change role, deactivate) gated on step-up MFA + RPC with `require_aal2()`.
- **SEC-005** — once `NEXT_PUBLIC_ADMIN_SLUG` is rotated, update this
  document's URLs accordingly.
