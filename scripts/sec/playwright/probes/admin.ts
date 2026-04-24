/**
 * admin.ts — probes specific to the bright-tale admin surface (apps/web).
 *
 * Architecture (observed, not assumed):
 *   • Admin slug is configurable via NEXT_PUBLIC_ADMIN_SLUG (default: "admin").
 *   • Public URL /{slug}/* is rewritten to internal /zadmin/*.
 *   • Direct /zadmin/* must return 404 (defense against bypass).
 *   • Middleware enforces Supabase auth + isAdminUser() on protected routes.
 *
 * This probe checks:
 *   A. Default-slug exposure (if slug is default "admin", attackers find it with zero recon).
 *   B. /zadmin direct access is blocked (the middleware invariant).
 *   C. Login hardening on /admin/login (enumeration + timing + rate limit — stricter bar than user login).
 *   D. Protected routes redirect unauthenticated requests and do not leak data.
 *   E. Admin pages carry stricter cache/CSP than public pages.
 *   F. Logout invalidates reliably and is resistant to CSRF.
 *   G. Reset-password token surface basic hygiene.
 */

import type { Recorder } from "../lib/record.ts";
import { probe, timedProbe, formatRequest, formatResponse } from "../lib/http.ts";
import { welchT, mean, stddev } from "../lib/stats.ts";

interface Ctx {
  webBase: string;               // e.g. http://localhost:3002
  adminSlug?: string;            // defaults to "admin"
  record: Recorder["record"];
}

export async function runAdminProbes(ctx: Ctx): Promise<void> {
  const slug = ctx.adminSlug ?? "admin";
  const base = ctx.webBase.replace(/\/$/, "");
  const admin = (p: string) => `${base}/${slug}${p.startsWith("/") ? p : "/" + p}`;

  // ───────────────────────────────────────────────────────────────
  // A. Default-slug exposure
  // ───────────────────────────────────────────────────────────────
  if (slug === "admin") {
    const r = await probe({ url: admin("/login"), followRedirects: false }).catch(() => null);
    if (r && r.status < 400) {
      ctx.record({
        title: "Admin panel exposed at default /admin slug",
        severity: "low",
        category: "auth",
        stack_area: "app-middleware",
        cwe: ["CWE-200"],
        owasp: ["A05:2021"],
        location: { url: admin("/login") },
        evidence: { snippet: `GET ${admin("/login")} → HTTP ${r.status}\n\nDefault slug 'admin' is guessed by every web scanner in the first second.` },
        fix: {
          summary:
            "Set NEXT_PUBLIC_ADMIN_SLUG in Vercel env to an unguessable string (≥12 chars, random). Slug obscurity is not a primary control — but combined with rate limit, MFA, and an IP allowlist it raises the attacker cost materially. Current slug is the worst case.",
        },
        tags: ["admin", "slug-exposure"],
      });
    }
  }

  // ───────────────────────────────────────────────────────────────
  // B. /zadmin direct access must be 404
  // ───────────────────────────────────────────────────────────────
  for (const p of ["/zadmin", "/zadmin/login", "/zadmin/users", "/zadmin/agents"]) {
    const r = await probe({ url: base + p, followRedirects: false }).catch(() => null);
    if (!r) continue;
    if (r.status !== 404) {
      ctx.record({
        title: `Internal admin path ${p} is reachable directly (expected 404)`,
        severity: "high",
        category: "auth",
        stack_area: "app-middleware",
        cwe: ["CWE-284", "CWE-425"],
        owasp: ["A01:2021"],
        location: { url: base + p, method: "GET" },
        evidence: { response: formatResponse(r) },
        fix: {
          summary:
            "apps/web/src/middleware.ts must return 404 for any path starting with /zadmin. The middleware currently does this — if this finding fires, a recent change broke the guard.",
        },
        tags: ["admin", "bypass"],
      });
    }
  }

  // ───────────────────────────────────────────────────────────────
  // B2. MFA / AAL2 enforcement — highest-priority finding for admin
  // ───────────────────────────────────────────────────────────────
  // Detection: grep confirmed zero references to mfa/totp/aal2/factor in
  // apps/web + apps/api source (2026-04-23). Until this changes, admin is
  // single-factor. Admin panel controls: users list, orgs, agent prompts,
  // engine logs, affiliates, payouts — full-blast blast radius if stolen.
  ctx.record({
    title: "Admin panel has no MFA — single password compromise = full admin",
    severity: "critical",
    category: "auth",
    stack_area: "app-middleware",
    cwe: ["CWE-308", "CWE-287"],
    owasp: ["A07:2021"],
    asvs: ["V2.8.1", "V2.2.4"],
    location: { url: admin("/login"), file: "apps/web/src/middleware.ts" },
    evidence: {
      snippet:
        "Source review confirms no MFA/TOTP/AAL2/factor enforcement in apps/web or apps/api.\n" +
        "Admin login is password-only.\n" +
        "Admin surface includes: users, orgs, agent prompts, engine logs, affiliates, payouts.\n" +
        "A phished/intercepted admin password yields immediate full takeover.",
    },
    fix: {
      summary:
        "1) Enforce Supabase TOTP MFA on all admin accounts (apps/web admin login must call `verifyFactor` after password). 2) Require aal='aal2' on every /admin/(protected)/* route — check in apps/web middleware after user fetch. 3) Recovery codes via the SEC-001 migration (Argon2id, one-shot). 4) Audit MFA events into user_mfa_audit_log. See docs/security/SEC-002-admin-hardening.md for the full plan.",
    },
    cvss: { vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:H/A:H", score: 9.6 },
    tags: ["admin", "mfa", "critical", "single-factor"],
  });

  // ───────────────────────────────────────────────────────────────
  // C. Login hardening — enumeration + timing + rate limit
  // ───────────────────────────────────────────────────────────────
  const loginUrl = admin("/login");

  // 1) Response-divergence probe. apps/web's login posts to Supabase Auth via
  //    a Server Action. The action URL is the same page with POST + a
  //    specific header. We skip the Server Action form probe (framework
  //    CSRF token is opaque) and instead probe the Supabase Auth endpoint
  //    that the page hits — but we don't have that URL without signing in.
  //    So: limit this category to a surface check — does the page itself
  //    leak different errors for different identities via query string?
  const errCases = [
    { label: "no error", q: "" },
    { label: "unauth", q: "?error=unauthorized" },
    { label: "invalid", q: "?error=invalid_credentials" },
    { label: "rate", q: "?error=rate_limited" },
  ];
  const responses = await Promise.all(
    errCases.map((c) => probe({ url: loginUrl + c.q, followRedirects: false }).catch(() => null)),
  );
  const distinctStatuses = new Set(responses.filter(Boolean).map((r) => r!.status));
  // Not itself a finding — but we record an info note for completeness.
  if (distinctStatuses.size > 1) {
    ctx.record({
      title: "Admin login page responds with multiple distinct statuses for different ?error query values",
      severity: "info",
      category: "auth",
      stack_area: "frontend",
      location: { url: loginUrl },
      evidence: { snippet: `Statuses observed: ${[...distinctStatuses].join(", ")}` },
      fix: { summary: "Verify that ?error query values are server-rendered into the same layout and cannot be used to distinguish real vs synthetic error states." },
      tags: ["admin", "info"],
    });
  }

  // 2) Rate-limit probe — hammer the admin login, expect 429.
  //    Policy:
  //      • dev target (loose ceiling 100/15min): 40 attempts; positive 429
  //        = verified, negative = info "verify in staging"
  //      • staging/prod (strict ceiling 30/15min): 40 attempts; first 429
  //        around #31 = verified; no 429 = real high-severity finding
  //    Admin rate-limit probe deliberately skips the bypass header so the
  //    limiter fires normally.
  const MAX_ATTEMPTS = 40;
  const isLocalAdmin = /localhost|127\.0\.0\.1/.test(ctx.webBase);
  const saHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Next-Action": "00000000000000000000000000000000000000",
    Accept: "text/x-component",
    "X-BrightSec-Skip-Bypass": "1",
  };
  const statuses: number[] = [];
  let firstLimitAt = -1;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const r = await probe({
      url: loginUrl,
      method: "POST",
      headers: saHeaders,
      body: `email=probe-${i}@brighttale.io&password=wrong`,
      followRedirects: false,
    }).catch(() => null);
    if (r) statuses.push(r.status);
    if (r?.status === 429 || /rate[\s_-]?limit|too[\s_-]?many/i.test(r?.body ?? "")) {
      firstLimitAt = i + 1;
      break;
    }
    await new Promise((res) => setTimeout(res, 100));
  }

  if (firstLimitAt > 0) {
    ctx.record({
      title: `Admin rate limit verified — first 429 at attempt ${firstLimitAt}/${MAX_ATTEMPTS}`,
      severity: "info",
      category: "auth",
      stack_area: "app-middleware",
      owasp: ["A07:2021"],
      location: { url: loginUrl, method: "POST" },
      evidence: {
        snippet: `Sent ${statuses.length} POSTs. First 429 returned at attempt ${firstLimitAt}.\nUnique statuses: ${[...new Set(statuses)].join(", ")}`,
      },
      tags: ["admin", "rate-limit", "verified"],
    });
  } else if (statuses.length >= 15) {
    ctx.record({
      title: isLocalAdmin
        ? `Admin rate limit did not fire within ${MAX_ATTEMPTS} attempts (dev config — loose by design, re-run against staging to validate prod behavior)`
        : `No rate limit observed on admin login endpoint (${MAX_ATTEMPTS} rapid POSTs all admitted)`,
      severity: isLocalAdmin ? "info" : "high",
      category: "auth",
      stack_area: "app-middleware",
      cwe: isLocalAdmin ? undefined : ["CWE-307"],
      owasp: ["A07:2021"],
      asvs: ["V2.2.2"],
      location: { url: loginUrl, method: "POST" },
      evidence: {
        snippet:
          `Attempts: ${statuses.length}  Unique statuses: ${[...new Set(statuses)].join(", ")}.` +
          (isLocalAdmin
            ? `\n\nDev policy: 100 POSTs per 15-min window per IP. Prod policy: 30. To verify the prod path fires, run the pentest against staging.`
            : `\n\nNo 429, no slowdown — admin brute-force surface is open on the highest-value auth flow in the system.`),
      },
      fix: isLocalAdmin
        ? { summary: "No action needed in dev. Validate in staging." }
        : {
            summary:
              "Rate limit /admin/login much stricter than user login: 5 attempts per IP per 10 min, 3 per identity per 15 min. After 3 failures, force Turnstile; after 5, 30-min lock with email unlock. Consider an allowlist of admin source IPs.",
          },
      cvss: isLocalAdmin ? undefined : { vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", score: 9.6 },
      tags: ["admin", "rate-limit", isLocalAdmin ? "dev-only" : "brute-force", "high-value"],
    });
  }

  // 3) Timing side-channel on the admin login form itself (pre-Supabase).
  //    Even if the form just renders, different ?email= values shouldn't
  //    produce different render times. 30 trials × 2.
  const tA = await timedProbe({ url: loginUrl + "?email=admin@brighttale.io" }, 30);
  const tB = await timedProbe({ url: loginUrl + "?email=notanemail" }, 30);
  if (tA.length >= 20 && tB.length >= 20) {
    const t = welchT(tA, tB);
    const delta = Math.abs(t.meanA - t.meanB);
    if (t.p < 0.05 && delta > 25) {
      ctx.record({
        title: `Admin login page render time leaks a timing signal (${delta.toFixed(0)}ms, p=${t.p.toExponential(2)})`,
        severity: "medium",
        category: "auth",
        stack_area: "frontend",
        cwe: ["CWE-208"],
        location: { url: loginUrl },
        evidence: {
          snippet:
            `case A (@brighttale.io): mean=${mean(tA).toFixed(1)}ms sd=${stddev(tA).toFixed(1)}\n` +
            `case B (malformed):      mean=${mean(tB).toFixed(1)}ms sd=${stddev(tB).toFixed(1)}`,
        },
        fix: { summary: "The GET on /admin/login must not branch on the email query param — it's just a form render. Investigate any Server Component that reads query and touches the DB." },
        tags: ["admin", "timing"],
      });
    }
  }

  // ───────────────────────────────────────────────────────────────
  // D. Protected routes must redirect unauthenticated requests (not leak)
  // ───────────────────────────────────────────────────────────────
  const protectedPaths = [
    "/users",
    "/orgs",
    "/agents",
    "/engine-logs",
    "/analytics",
    "/affiliates",
    "/affiliates/payouts",
    "/affiliates/fraud",
  ];
  for (const p of protectedPaths) {
    const url = admin(p);
    const r = await probe({ url, followRedirects: false }).catch(() => null);
    if (!r) continue;

    const isRedirect = r.status >= 300 && r.status < 400;
    const landing = r.headers["location"] ?? "";
    const goesToLogin = /\/login/.test(landing);

    // Good state: redirect to login. Bad: 200 with content, 404 with content, 500.
    if (r.status === 200 && r.bodyBytes > 2000 && !r.body.includes("login")) {
      ctx.record({
        title: `Admin protected route ${p} returned 200 to unauthenticated request`,
        severity: "critical",
        category: "auth",
        stack_area: "app-middleware",
        cwe: ["CWE-285", "CWE-862"],
        owasp: ["A01:2021"],
        location: { url, method: "GET" },
        evidence: { response: formatResponse(r) },
        fix: { summary: "apps/web/src/middleware.ts must redirect or 401 on any /admin/<protected>. A 200 here means the middleware does not cover this route or the matcher regex misses it." },
        cvss: { vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", score: 10.0 },
        tags: ["admin", "auth-bypass", "critical"],
      });
    } else if (isRedirect && !goesToLogin) {
      ctx.record({
        title: `Admin protected route ${p} redirected unauthenticated request to a non-login URL`,
        severity: "medium",
        category: "auth",
        stack_area: "app-middleware",
        location: { url },
        evidence: { snippet: `Status ${r.status}, Location: ${landing}` },
        fix: { summary: "Unauth redirects should go to /admin/login with a `?next=` param (same-origin-only). Any other target is a bug or a phishing-able surface." },
        tags: ["admin", "redirect"],
      });
    } else if (r.status === 500) {
      ctx.record({
        title: `Admin protected route ${p} threw 500 on unauthenticated request`,
        severity: "medium",
        category: "auth",
        stack_area: "app-middleware",
        location: { url },
        evidence: { response: formatResponse(r) },
        fix: { summary: "Middleware should reject before handler runs. A 500 on unauth suggests the handler is reached and crashes because it expects a session." },
        tags: ["admin", "error"],
      });
    }
  }

  // ───────────────────────────────────────────────────────────────
  // E. Cache headers on admin pages
  // ───────────────────────────────────────────────────────────────
  const adminLogin = await probe({ url: loginUrl, followRedirects: false }).catch(() => null);
  if (adminLogin) {
    const cc = adminLogin.headers["cache-control"] ?? "";
    const hasNoStore = /no-store/i.test(cc);
    if (!hasNoStore) {
      ctx.record({
        title: "Admin pages lack Cache-Control: no-store",
        severity: "low",
        category: "headers",
        stack_area: "app-middleware",
        cwe: ["CWE-524"],
        location: { url: loginUrl },
        evidence: { snippet: `cache-control: ${cc || "(not set)"}` },
        fix: { summary: "All /admin/* responses should include `Cache-Control: no-store, must-revalidate`. An intermediate proxy or shared browser cache should never retain admin content." },
        tags: ["admin", "cache"],
      });
    }
  }

  // ───────────────────────────────────────────────────────────────
  // F. Logout behavior
  // ───────────────────────────────────────────────────────────────
  const logoutGet = await probe({ url: admin("/logout"), followRedirects: false, method: "GET" }).catch(() => null);
  if (logoutGet && logoutGet.status >= 200 && logoutGet.status < 400 && !logoutGet.headers["set-cookie"]) {
    // A GET logout without Set-Cookie is suspicious — either it doesn't
    // actually clear the session, or it returns 200 without action (CSRF-
    // accessible GET is itself bad practice for state-changing ops).
    ctx.record({
      title: "Admin /logout accepts GET and may not clear session cookies",
      severity: "medium",
      category: "csrf",
      stack_area: "app-middleware",
      cwe: ["CWE-352"],
      location: { url: admin("/logout") },
      evidence: { response: formatResponse(logoutGet) },
      fix: { summary: "Logout must be POST-only (or at least set cookies to expired values even on GET). A GET-accessible logout that invalidates server-side session is CSRF-attackable (attacker image tag forces logout). A GET that does nothing is worse." },
      tags: ["admin", "logout", "csrf"],
    });
  }

  // ───────────────────────────────────────────────────────────────
  // G. Reset password token hygiene
  // ───────────────────────────────────────────────────────────────
  const resetEmpty = await probe({ url: admin("/reset-password") }).catch(() => null);
  const resetBogus = await probe({ url: admin("/reset-password?token=not-a-real-token") }).catch(() => null);
  if (resetEmpty && resetBogus && resetEmpty.status === 200 && resetBogus.status === 200 && resetEmpty.body === resetBogus.body) {
    // Page renders identically with and without a token — ok, token is
    // validated client-side or on submit, no info leak here.
  } else if (resetEmpty && resetBogus && resetEmpty.body !== resetBogus.body) {
    // Different rendering → potential info leak about token validity.
    const lenDelta = Math.abs(resetEmpty.bodyBytes - resetBogus.bodyBytes);
    // Next.js client-component hydration can introduce small body-size
    // variation from serialized query state even when the rendered form is
    // identical. Only flag when the difference is substantial.
    if (lenDelta > 200) {
      ctx.record({
        title: "Reset-password page renders differently for missing vs bogus token (possible info leak)",
        severity: "low",
        category: "auth",
        stack_area: "frontend",
        cwe: ["CWE-204"],
        location: { url: admin("/reset-password") },
        evidence: { snippet: `No token: ${resetEmpty.bodyBytes} bytes. Bogus token: ${resetBogus.bodyBytes} bytes. Delta: ${lenDelta} bytes.` },
        fix: { summary: "The reset-password page should render identically regardless of token validity. Validate the token only on form submission, return a generic 'invalid or expired' on failure." },
        tags: ["admin", "reset-password"],
      });
    }
  }
}
