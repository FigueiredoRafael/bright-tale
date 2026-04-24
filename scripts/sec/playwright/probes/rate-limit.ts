/**
 * rate-limit.ts — verify the login endpoint rate-limits brute force.
 *
 * Sends 20 POST requests with wrong password as fast as the client allows
 * (but capped at ~10 rps for courtesy). Expects at least one 429 response,
 * OR an identical-but-delayed response after a threshold. If all 20
 * return the same status with no delay escalation, there is no visible
 * rate limit on this axis.
 *
 * Does NOT use real credentials. Does NOT lock any account (uses random
 * well-formed email, not a real user's).
 */

import type { Recorder } from "../lib/record.ts";
import { probe } from "../lib/http.ts";

interface Ctx {
  appBase: string;
  loginUrl?: string;
  record: Recorder["record"];
}

export async function runRateLimitProbes(ctx: Ctx): Promise<void> {
  const url =
    ctx.loginUrl ?? ctx.appBase.replace(/\/$/, "") + "/api/auth/login";

  // Policy:
  //   Local dev targets have intentionally loose limits (so pentest probes
  //   can run without saturating the ceiling every time). We send up to
  //   `MAX_ATTEMPTS` POSTs trying to trigger a 429; if we never see one,
  //   and the target is localhost, we tag it info with a note to verify
  //   in staging. If the target is anything else (staging / prod), a
  //   missing 429 is a real high-severity finding.
  const MAX_ATTEMPTS = 40;
  const isLocal = /localhost|127\.0\.0\.1/.test(ctx.appBase);
  const timings: number[] = [];
  const statuses: number[] = [];
  let firstLimitAt = -1;

  const randomEmail = () =>
    `probe-${Math.random().toString(36).slice(2, 10)}@brighttale.io`;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const r = await probe({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Explicitly opt out of the HMAC bypass — this probe's whole job
        // is to verify the rate limiter fires under hostile traffic.
        "X-BrightSec-Skip-Bypass": "1",
      },
      body: JSON.stringify({ email: randomEmail(), password: "wrong" }),
      followRedirects: false,
    }).catch(() => null);
    if (!r) continue;
    statuses.push(r.status);
    timings.push(r.elapsedMs);
    if (r.status === 429 || /rate[\s_-]?limit|too[\s_-]?many/i.test(r.body)) {
      firstLimitAt = i + 1;
      break;
    }
    await new Promise((res) => setTimeout(res, 100));
  }

  if (firstLimitAt > 0) {
    // Positive finding — the limiter works. Record at info severity so it
    // shows up in the report as a verified control, not a gap.
    ctx.record({
      title: `Rate limit verified on login — first 429 at attempt ${firstLimitAt}/${MAX_ATTEMPTS}`,
      severity: "info",
      category: "auth",
      stack_area: "api-route",
      owasp: ["A07:2021"],
      location: { url, method: "POST" },
      evidence: {
        snippet:
          `Sent ${statuses.length} POSTs. First 429 returned at attempt ${firstLimitAt}.\n` +
          `Unique statuses: ${[...new Set(statuses)].join(", ")}`,
      },
      tags: ["auth", "rate-limit", "verified"],
    });
    return;
  }

  // No 429 observed within MAX_ATTEMPTS.
  if (statuses.length >= 15) {
    const firstMean = avg(timings.slice(0, 5));
    const lastMean = avg(timings.slice(-5));
    const escalating = lastMean > firstMean * 1.5;
    if (!escalating) {
      ctx.record({
        title: isLocal
          ? `Rate limit did not fire within ${MAX_ATTEMPTS} attempts (dev config — loose by design, re-run against staging to validate prod behavior)`
          : `No rate limit observed on login endpoint (${MAX_ATTEMPTS} rapid attempts all accepted)`,
        severity: isLocal ? "info" : "high",
        category: "auth",
        stack_area: "api-route",
        cwe: isLocal ? undefined : ["CWE-307", "CWE-799"],
        owasp: ["A07:2021"],
        asvs: ["V2.2.2"],
        location: { url, method: "POST" },
        evidence: {
          snippet:
            `Attempts: ${statuses.length}  Unique statuses: ${[...new Set(statuses)].join(", ")}\n` +
            `Mean first-5: ${firstMean.toFixed(1)}ms  Mean last-5: ${lastMean.toFixed(1)}ms` +
            (isLocal
              ? `\n\nNode is running in dev mode. Dev policy: 100 POSTs per 15-min window per IP. Prod policy: 30. To verify the prod path fires, run: npx tsx scripts/sec/playwright/pentest.ts --app=https://staging.brighttale.io`
              : `\n\nNo 429, no slowdown — brute-force surface is open.`),
        },
        fix: isLocal
          ? { summary: "No action needed in dev. Validate in staging." }
          : {
              summary:
                "Add sliding-window rate limits on three axes simultaneously (per IP, per identity hash, per route). After 5 fails per identity within 15 min, require Turnstile; after 10, soft-lock 30 min.",
            },
        cvss: isLocal ? undefined : { vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:L", score: 8.8 },
        tags: ["auth", "rate-limit", isLocal ? "dev-only" : "brute-force"],
      });
    }
  }
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
