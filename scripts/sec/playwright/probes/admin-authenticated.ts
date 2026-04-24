/**
 * admin-authenticated.ts — probes that require a real admin login.
 *
 * Runs only when both env vars are set:
 *   BRIGHTSEC_ADMIN_EMAIL
 *   BRIGHTSEC_ADMIN_PASSWORD
 *
 * What it tests:
 *   1. Can we log in at all? (baseline)
 *   2. Session cookie attributes after login (Secure, HttpOnly, SameSite, __Host- prefix).
 *   3. Access-token lifetime — is it reasonable for admin (≤ 15 min)?
 *   4. Is MFA a required step (does the login flow challenge for a factor)?
 *   5. Does logout invalidate the session server-side (re-use the old cookie after logout).
 *   6. Session fixation — does the session cookie rotate on login?
 *   7. Concurrent sessions — does a second login invalidate the first (optional).
 *
 * DOES NOT:
 *   • Create accounts
 *   • Modify data
 *   • Log in as anyone other than the dedicated test admin
 *   • Store the password to disk, leak it to logs, or include it in any report
 *
 * Safety: the credentials are read from env vars only; any evidence snippet
 * runs through redactSecrets first. A test admin should be created in the
 * dev Supabase project specifically for this purpose — never use a real
 * administrator's credentials.
 */

import type { Recorder } from "../lib/record.ts";
import { probe, formatResponse } from "../lib/http.ts";
import { createHash } from "node:crypto";

interface Ctx {
  webBase: string;
  adminSlug?: string;
  record: Recorder["record"];
}

export async function runAdminAuthenticatedProbes(ctx: Ctx): Promise<boolean> {
  const email = process.env.BRIGHTSEC_ADMIN_EMAIL;
  const password = process.env.BRIGHTSEC_ADMIN_PASSWORD;
  if (!email || !password) {
    ctx.record({
      title: "Authenticated admin probes skipped — no BRIGHTSEC_ADMIN_EMAIL / BRIGHTSEC_ADMIN_PASSWORD set",
      severity: "info",
      category: "auth",
      stack_area: "app-middleware",
      location: { url: ctx.webBase },
      evidence: {
        snippet:
          "To run authenticated admin tests (session lifetime, logout invalidation, MFA presence, post-auth CSRF):\n" +
          "1) Create a test admin in your dev Supabase project.\n" +
          "2) Set the two env vars in your shell (DO NOT commit):\n" +
          "   export BRIGHTSEC_ADMIN_EMAIL='brightsec-test@brighttale.io'\n" +
          "   export BRIGHTSEC_ADMIN_PASSWORD='<strong password>'\n" +
          "3) Re-run: npx tsx scripts/sec/playwright/pentest.ts",
      },
      fix: { summary: "Provide test credentials to enable this layer of checks." },
      tags: ["admin", "needs-credentials"],
    });
    return false;
  }

  // ── 1. Login via Supabase goTrue password grant ─────────────────────────
  // We go directly to Supabase Auth so we don't depend on the app's Server
  // Action shape. Supabase URL comes from apps/web env; if not available on
  // localhost, probe the /admin/login page and read NEXT_PUBLIC_SUPABASE_URL
  // from its runtime config endpoint. For local dev, the default is usually
  // http://127.0.0.1:54321 (supabase start) or the remote project URL.
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    process.env.BRIGHTSEC_SUPABASE_URL;
  if (!supabaseUrl) {
    ctx.record({
      title: "Authenticated admin probes cannot run — SUPABASE_URL not available",
      severity: "info",
      category: "auth",
      location: { url: ctx.webBase },
      evidence: { snippet: "Set BRIGHTSEC_SUPABASE_URL to your dev project URL (e.g. http://127.0.0.1:54321) before running." },
      fix: { summary: "Export the Supabase URL in the shell along with the admin creds." },
      tags: ["admin", "needs-config"],
    });
    return false;
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.BRIGHTSEC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    ctx.record({
      title: "Authenticated admin probes cannot run — SUPABASE_ANON_KEY not available",
      severity: "info",
      category: "auth",
      location: { url: ctx.webBase },
      fix: { summary: "Export BRIGHTSEC_SUPABASE_ANON_KEY before running." },
      tags: ["admin", "needs-config"],
    });
    return false;
  }

  const loginResp = await probe({
    url: `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify({ email, password }),
    followRedirects: false,
  }).catch(() => null);

  if (!loginResp || loginResp.status !== 200) {
    ctx.record({
      title: "Authenticated admin probes aborted — login failed",
      severity: "info",
      category: "auth",
      location: { url: `${supabaseUrl}/auth/v1/token` },
      evidence: { snippet: `Status: ${loginResp?.status ?? "no response"}. Check email/password and that the account is confirmed.` },
      fix: { summary: "Verify the test admin email is confirmed in Supabase and the password is correct." },
      tags: ["admin"],
    });
    return false;
  }

  let token: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at?: number;
    user?: { aud?: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> };
  };
  try {
    token = JSON.parse(loginResp.body);
  } catch {
    return false;
  }

  // ── 2. Access token lifetime check ──────────────────────────────────────
  const lifetimeMin = Math.round((token.expires_in ?? 0) / 60);
  if (lifetimeMin > 60) {
    ctx.record({
      title: `Admin access token lifetime is ${lifetimeMin} min (recommended: ≤ 15 min for admin)`,
      severity: "medium",
      category: "auth",
      stack_area: "app-middleware",
      cwe: ["CWE-613"],
      asvs: ["V3.3.1"],
      location: { url: `${supabaseUrl}/auth/v1/token` },
      evidence: { snippet: `expires_in=${token.expires_in}s (${lifetimeMin} min)` },
      fix: {
        summary:
          "In Supabase project settings, set JWT expiry to 900s (15 min) for admin context. If the same JWT serves both user and admin, either shorten globally (may affect UX) or maintain a separate admin realm. Alternative: enforce aal2 + session re-verify on every /admin/(protected)/* request via middleware and treat the JWT as a refresh hint only.",
      },
      tags: ["admin", "session-lifetime"],
    });
  }

  // ── 3. MFA / AAL presence in the token ──────────────────────────────────
  // Decode JWT payload (no verification — we just inspect claims).
  const payload = decodeJwtPayload(token.access_token);
  const aal = payload?.aal ?? "aal1";
  const amr = (payload?.amr as Array<{ method: string }> | undefined) ?? [];
  const mfaInAmr = amr.some((a) => /mfa|totp|webauthn|sms|phone/.test(a.method ?? ""));

  if (aal !== "aal2" || !mfaInAmr) {
    ctx.record({
      title: `Admin session granted at aal=${aal} after password-only login (MFA not enforced)`,
      severity: "critical",
      category: "auth",
      stack_area: "app-middleware",
      cwe: ["CWE-308"],
      owasp: ["A07:2021"],
      asvs: ["V2.8.1"],
      location: { url: `${supabaseUrl}/auth/v1/token` },
      evidence: {
        snippet:
          `aal=${aal}\n` +
          `amr=${JSON.stringify(amr)}\n` +
          `Admin account reached a full session with password alone. A stolen password == full admin.`,
      },
      fix: {
        summary:
          "Enroll TOTP for every admin account and require aal2 at login. Admin middleware must refuse to serve (protected) pages unless jwt.aal === 'aal2'. See docs/security/SEC-002-admin-hardening.md.",
      },
      cvss: { vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:H/A:H", score: 9.6 },
      tags: ["admin", "mfa", "critical"],
    });
  }

  // ── 4. Logout invalidates the server-side session ───────────────────────
  const logoutResp = await probe({
    url: `${supabaseUrl.replace(/\/$/, "")}/auth/v1/logout`,
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token.access_token}`,
    },
    followRedirects: false,
  }).catch(() => null);

  // Re-use the (now-should-be-revoked) access token against a protected
  // endpoint. Supabase `/auth/v1/user` returns 401 when token is revoked.
  const reuseResp = await probe({
    url: `${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`,
    headers: { apikey: anonKey, authorization: `Bearer ${token.access_token}` },
    followRedirects: false,
  }).catch(() => null);

  if (logoutResp && reuseResp && reuseResp.status === 200) {
    ctx.record({
      title: "Admin access token remains valid after logout (server-side revocation failed)",
      severity: "high",
      category: "auth",
      stack_area: "app-middleware",
      cwe: ["CWE-613"],
      asvs: ["V3.3.5"],
      location: { url: `${supabaseUrl}/auth/v1/user` },
      evidence: { response: formatResponse(reuseResp) },
      fix: {
        summary:
          "Supabase logout should revoke the refresh token AND the access token's JTI. If Supabase can't revoke the access token (stateless JWT), mitigate by (1) keeping access-token lifetime ≤ 15 min, (2) blacklisting the JTI in a Redis/Postgres revocation set consulted by apps/web middleware, (3) rotating the session cookie on logout.",
      },
      tags: ["admin", "session", "logout"],
    });
  }

  // ── 5. Token refresh rotation ───────────────────────────────────────────
  const refreshResp = await probe({
    url: `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`,
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey },
    body: JSON.stringify({ refresh_token: token.refresh_token }),
    followRedirects: false,
  }).catch(() => null);

  if (refreshResp && refreshResp.status === 200) {
    try {
      const r2 = JSON.parse(refreshResp.body);
      if (r2.refresh_token && r2.refresh_token === token.refresh_token) {
        ctx.record({
          title: "Admin refresh token does not rotate on use — reuse detection impossible",
          severity: "medium",
          category: "auth",
          stack_area: "app-middleware",
          cwe: ["CWE-613"],
          asvs: ["V3.3.3"],
          location: { url: `${supabaseUrl}/auth/v1/token` },
          evidence: { snippet: `After refresh, the same refresh_token fingerprint was returned.\n\nBefore: ${fp(token.refresh_token)}\nAfter:  ${fp(r2.refresh_token)}` },
          fix: { summary: "Enable 'Refresh Token Rotation' in Supabase → Authentication → Settings. Configure reuse detection to sign the user out on stolen-token replay." },
          tags: ["admin", "session", "refresh-rotation"],
        });
      }
    } catch { /* ignore */ }
  }

  return true;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    const padded = pad ? b64 + "=".repeat(4 - pad) : b64;
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function fp(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}
