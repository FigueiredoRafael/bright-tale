/**
 * auth-enumeration.ts — probe the login endpoint for:
 *   a) response-body / status divergence between valid and invalid emails
 *   b) timing side-channel between the two cases
 *
 * Uses 30 trials per case (Welch t-test threshold p < 0.05, |Δmean| > 25ms).
 * Sends only wrong passwords. Does NOT attempt to log in with any real
 * credential. Does NOT create, modify, or lock any account — values well
 * below a reasonable rate-limit threshold.
 */

import type { Recorder } from "../lib/record.ts";
import { probe, timedProbe, formatResponse, formatRequest } from "../lib/http.ts";
import { welchT, mean, stddev } from "../lib/stats.ts";

interface Ctx {
  appBase: string;
  record: Recorder["record"];
}

const LIKELY_LOGIN_PATHS = [
  "/api/auth/login",
  "/api/auth/signin",
  "/api/auth/signIn",
  "/api/auth/password",
  "/en/auth/login",
  "/pt-BR/auth/login",
];

export async function runAuthEnumerationProbes(ctx: Ctx): Promise<void> {
  // 1. Find an endpoint that looks like login.
  let loginUrl: string | null = null;
  for (const path of LIKELY_LOGIN_PATHS) {
    const url = ctx.appBase.replace(/\/$/, "") + path;
    const r = await probe({
      url,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "probe@example.com", password: "x" }),
      followRedirects: false,
    }).catch(() => null);
    if (!r) continue;
    // "Looks like login" = responds to JSON POST with 4xx/2xx, not 404 HTML.
    if (r.status !== 404 && !/<!doctype/i.test(r.body.slice(0, 60))) {
      loginUrl = url;
      break;
    }
  }
  if (!loginUrl) {
    ctx.record({
      title: "Login endpoint not auto-discoverable — enumeration + timing checks skipped",
      severity: "info",
      category: "auth",
      stack_area: "api-route",
      location: { url: ctx.appBase },
      evidence: { snippet: `Tried: ${LIKELY_LOGIN_PATHS.join(", ")}` },
      fix: { summary: "Rerun with --login-url=… once the endpoint path is known." },
      tags: ["auth", "needs-config"],
    });
    return;
  }

  // 2. Response-divergence probe. Single request per case (cheap).
  const validEmail = "owner+brightsec_probe@brighttale.io"; // implausible but well-formed
  const invalidEmail = "__not_a_valid_email_format__";

  const A = await probe({
    url: loginUrl,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: validEmail, password: "DefinitelyWrong-" + Date.now() }),
    followRedirects: false,
  }).catch(() => null);
  const B = await probe({
    url: loginUrl,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: invalidEmail, password: "DefinitelyWrong-" + Date.now() }),
    followRedirects: false,
  }).catch(() => null);

  if (A && B) {
    const sameStatus = A.status === B.status;
    const bodyASize = A.bodyBytes;
    const bodyBSize = B.bodyBytes;
    const sameBody = A.body === B.body;
    const messageA = extractMessage(A.body);
    const messageB = extractMessage(B.body);

    if (!sameStatus || !sameBody) {
      ctx.record({
        title: "Login response diverges between valid-format and invalid-format emails",
        severity: "high",
        category: "auth",
        stack_area: "api-route",
        cwe: ["CWE-204", "CWE-200"],
        owasp: ["A07:2021"],
        asvs: ["V2.2.1"],
        location: { url: loginUrl, method: "POST" },
        evidence: {
          request: formatRequest({
            url: loginUrl,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"email":"…","password":"wrong"}',
          }),
          response:
            `Case A (valid-format email):  status=${A.status}  bytes=${bodyASize}  msg='${messageA}'\n` +
            `Case B (invalid-format):      status=${B.status}  bytes=${bodyBSize}  msg='${messageB}'`,
        },
        fix: {
          summary:
            "Return the identical response body and status for (a) unknown email, (b) wrong password, (c) locked account, (d) MFA required. Branch only on an opaque internal state that is revealed post-first-factor, not in the failure response.",
        },
        cvss: { vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N", score: 5.3 },
        tags: ["auth", "enumeration", "unauthenticated"],
      });
    }
  }

  // 3. Timing-oracle probe. 30 trials × 2 cases.
  const trials = 30;
  const caseA = await timedProbe(
    {
      url: loginUrl,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user" + Date.now() + "@brighttale.io", password: "wrong" }),
      followRedirects: false,
    },
    trials,
  );
  const caseB = await timedProbe(
    {
      url: loginUrl,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email-at-all", password: "wrong" }),
      followRedirects: false,
    },
    trials,
  );

  if (caseA.length >= 20 && caseB.length >= 20) {
    const t = welchT(caseA, caseB);
    const delta = Math.abs(t.meanA - t.meanB);
    if (t.p < 0.05 && delta > 25) {
      ctx.record({
        title: `Login timing oracle: ${delta.toFixed(0)}ms delta between valid-format and invalid-format emails (p=${t.p.toExponential(2)})`,
        severity: "high",
        category: "auth",
        stack_area: "api-route",
        cwe: ["CWE-208"],
        owasp: ["A07:2021"],
        asvs: ["V2.2.1"],
        location: { url: loginUrl, method: "POST" },
        evidence: {
          snippet:
            `trials=${trials}\n` +
            `case A (well-formed email)  mean=${mean(caseA).toFixed(1)}ms  sd=${stddev(caseA).toFixed(1)}ms\n` +
            `case B (malformed email)    mean=${mean(caseB).toFixed(1)}ms  sd=${stddev(caseB).toFixed(1)}ms\n` +
            `Welch's t  t=${t.t.toFixed(2)}  df=${t.df.toFixed(1)}  p=${t.p.toExponential(2)}`,
        },
        fix: {
          summary:
            "Always run the password check (using a fixed dummy Argon2id hash when the user does not exist) so total work is identical. Then pad to a deterministic floor of ~400ms plus uniform jitter.",
          diff:
            "// Inside login handler\n" +
            "const hash = user?.password_hash ?? DUMMY_ARGON2ID_HASH\n" +
            "const ok = await argon2.verify(hash, password)\n" +
            "const elapsed = Date.now() - started\n" +
            "await wait(Math.max(0, 400 - elapsed) + Math.random() * 100)\n" +
            "if (!user || !ok) return fail(401, { code: 'INVALID_CREDENTIALS' })\n",
        },
        cvss: { vector: "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N", score: 3.7 },
        tags: ["auth", "timing-oracle", "unauthenticated"],
      });
    }
  }
}

function extractMessage(body: string): string {
  try {
    const j = JSON.parse(body);
    return (
      j?.error?.message ??
      j?.error?.code ??
      j?.message ??
      String(body).slice(0, 60)
    );
  } catch {
    return body.slice(0, 60);
  }
}
