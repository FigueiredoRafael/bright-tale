# Email configuration — Resend (via SMTP)

All transactional + auth email goes through **Resend**, using its SMTP
endpoint (not the Resend SDK). One Resend API key feeds two consumers:

1. **apps/api transactional email** (affiliates, credits, content
   published, etc.) — via `apps/api/src/lib/email/provider.ts` →
   `smtp.ts` (nodemailer)
2. **Supabase Auth email** (password reset, invite, signup confirm) —
   via Supabase dashboard SMTP Settings

Same API key, two places to paste it, one point of rotation.

Why Resend:
- 3000 emails/month, 100/day — forever free, no credit card
- DKIM + SPF configured via the Resend dashboard (no DNS tinkering past
  initial setup)
- High deliverability for a new domain (their IP pool is well-warmed)
- When we outgrow free tier (~6-12 months at projected volume), the
  migration path is **Amazon SES at $0.10 per 1000 emails** — not
  Resend paid. See appendix.

## Step 1 · Create the Resend account

1. `https://resend.com/signup` → create account (no credit card)
2. **Add Domain** → `brighttale.com.br`
3. Resend shows you DNS records to add:
   - 1 × MX (for bounces/feedback)
   - 1 × TXT (SPF)
   - 1 × TXT (DKIM)
4. Paste the records into your DNS provider (Vercel DNS, Cloudflare,
   or wherever `brighttale.com.br` NS points). Wait 5-30 min for verification.
5. Once the domain shows "Verified" in the Resend dashboard, move on.

## Step 2 · Generate an API key

1. Resend dashboard → **API Keys** → **Create API Key**
2. Name: `brighttale-production` (or `-dev` for local testing)
3. Permission: **Sending access** (not Full access — least privilege)
4. Domain: restrict to `brighttale.com.br`
5. Copy the key (starts with `re_`). **Shown once** — save to your
   password manager immediately.

Generate a SEPARATE key for `-dev` if you want to distinguish local
traffic from prod traffic in the Resend logs.

## Step 3 · Configure apps/api + apps/web

Add to `apps/api/.env.local` (dev) AND `apps/web/.env.local` (dev)
AND Vercel env (staging + production) for BOTH workspaces:

```
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<the API key from Step 2>
SMTP_FROM=noreply@brighttale.com.br
```

The `SMTP_USER` is the literal string `resend` (not your email).
The `SMTP_PASS` is the API key — yes, Resend uses the key as the SMTP
password.

**Why both apps:**
- `apps/api` sends transactional emails (affiliates, credits, content
  published) via its existing `lib/email/provider.ts`.
- `apps/web` sends operational admin emails (manager promoted, future
  audit notifications) via its `lib/email/send.ts`. The SEC-008.1
  "promote to manager" flow uses this path.

Same credentials, different workspaces. One Resend account, one key
rotation point.

Restart apps/api (`npm run dev:api`). Test:

```bash
cd apps/api && npx tsx -e '
  import("./src/lib/email/provider.js").then(async ({ sendEmail }) => {
    const r = await sendEmail({
      to: "you@your-own-email.com",
      subject: "BrightTale Resend test",
      text: "If you see this, SMTP is wired correctly."
    });
    console.log("sent:", r);
  }).catch(e => { console.error(e); process.exit(1); });
'
```

Expected: `sent: { id: '<message-id>', provider: 'smtp' }` and the
message arrives within ~10 s. Check the Resend dashboard → **Emails**
— you'll see the delivery event logged.

## Step 4 · Configure Supabase Auth SMTP

Supabase has its own SMTP client — it never calls apps/api. Feed the
same Resend credentials into the Supabase dashboard so password reset
and invite emails also go through Resend:

1. `supabase.com/dashboard/project/<your-project-id>/settings/auth`
2. Scroll to **SMTP Settings** → toggle **Enable Custom SMTP**
3. Fill in:
   ```
   Host:            smtp.resend.com
   Port:            465
   Username:        resend
   Password:        <same Resend API key>
   Sender email:    noreply@brighttale.com.br
   Sender name:     BrightTale
   ```
4. Click **Save** → Supabase sends itself a test to confirm.

Without this, Supabase falls back to their default sender
(`noreply@mail.app.supabase.io`, rate-limited to 4 emails/hour) — fine
for dev, unacceptable for production deliverability.

## Step 5 · Tune auth email templates + token TTL

Still in the Supabase auth settings:

- **Email templates** — customize each:
  - **Confirm signup** — what new admin invitees see
  - **Magic link** — optional (only if passwordless is ever enabled)
  - **Invite user** — admin-invite email body
  - **Reset password** — forgot-password email body
  - Each template accepts `{{ .ConfirmationURL }}`, `{{ .Email }}`, etc.
- **Rate limits** (bottom of Auth settings):
  - Email sent: default is 4/hour — bump to **30/hour** to cover
    invite bursts without blocking.
  - OTP expiration: default 3600 s (1 h) — **drop to 600 s (10 min)**
    for reset-password so a stolen inbox ≠ unlimited replay window.

## Step 6 · Verify the hardened forgot-password flow end to end

After SMTP is wired:

1. Open `http://localhost:3002/<admin-slug>/login`
2. Click "Esqueci minha senha"
3. Enter a real admin email
4. You should see the generic success message: "If that email is
   registered, a reset link is on its way." (It does NOT say whether
   the email exists — that's intentional.)
5. Check the inbox → reset email arrived from `noreply@brighttale.com.br`
6. Click the link → lands on `/<admin-slug>/reset-password?token=...`
7. Enter new password → redirected to login
8. Log in with new password → MFA challenge → in.

Also test the abuse path (email-bomb protection):

```bash
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3002/<admin-slug>/forgot-password \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -H 'Next-Action: dummy' \
    -d 'email=victim@example.com'
done | sort | uniq -c
```

Expected: **3 emails actually sent**, then **9 uniform success
responses** that silently return without sending. Victim gets 3 emails
over 15 min, not 12. Rate limit works, attacker cannot distinguish
"limited" from "not registered".

## Step 7 · Ongoing monitoring

- **Resend dashboard → Emails** — delivery + bounce + complaint events
  per message. Investigate any bounce/complaint trend.
- **Resend dashboard → Logs** — real-time feed of all send attempts.
- **Supabase dashboard → Logs → auth** — auth-email delivery status.
- **apps/api Axiom stream** — `sendEmail` calls logged with
  `{ to, subject, provider }`. No body content, no PII beyond "to".

## Rotation

- Rotate the Resend API key every 90 days or on any suspected compromise.
- Generate new key in dashboard → paste into BOTH `apps/api/.env` and
  Supabase SMTP Password on the same day → delete old key.
- Test Step 6 after rotation.
- If the old key was committed or logged anywhere, rotate immediately.

## Which paths send what

| Trigger | Sender | Provider |
|---|---|---|
| Admin invites new admin (via Supabase dashboard) | Supabase Auth | Resend SMTP |
| User clicks "Forgot password" on admin login | Supabase Auth | Resend SMTP |
| User signs up on `/auth/signup` | Supabase Auth | Resend SMTP |
| Affiliate application approved | apps/api → email/provider.ts | Resend SMTP |
| Credits low / content published / etc | apps/api → email/provider.ts | Resend SMTP |

Everything lands on the same Resend account. One credential, one
dashboard, one place to check deliverability.

---

## Appendix — Migrating to Amazon SES when it makes sense

**Signal:** you're consistently hitting the 100/day or 3000/month
Resend free cap, or deliverability starts suffering on a specific
campaign.

**Migration (2 hours, zero downtime):**

1. AWS Console → **Simple Email Service** → **Verified identities**.
2. Verify the domain `brighttale.com.br` (add 3 TXT records for DKIM + a
   TXT for SPF — same kind of DNS setup as Resend).
3. Request **production access** (get out of sandbox mode). AWS
   approves in 24-48 h. Say in the ticket: "transactional emails for
   user accounts + affiliate payouts, no marketing, complaint rate
   historically < 0.1%".
4. IAM → create user `brighttale-ses-smtp` → attach policy
   `AmazonSESFullAccess` (or tighter custom policy restricted to
   SendEmail + SendRawEmail on your domain).
5. Generate SES SMTP credentials (IAM → Users → Security credentials →
   Generate credentials for SMTP). These are DIFFERENT from regular
   AWS keys — SES converts IAM creds to SMTP username/password.
6. Update env vars in BOTH `apps/api/.env` and Supabase dashboard:
   ```
   SMTP_HOST=email-smtp.us-east-1.amazonaws.com  # or your region
   SMTP_PORT=465
   SMTP_USER=<SES SMTP username from step 5>
   SMTP_PASS=<SES SMTP password from step 5>
   SMTP_FROM=noreply@brighttale.com.br  # same From, unchanged
   ```
7. Test send. Verify deliverability didn't regress.
8. In Resend: revoke the API key. Downgrade account or delete.

Cost after migration: **$0.10 per 1000 emails**. At projected 10k/month
volume that's **$1/month**. Indefinite.

No code change needed — `lib/email/smtp.ts` is SMTP-provider-agnostic.
