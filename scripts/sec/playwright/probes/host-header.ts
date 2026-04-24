/**
 * host-header.ts — Host header injection probe.
 *
 * An app that trusts the Host header for building password-reset URLs,
 * canonical URLs, or email contents can be tricked into embedding an
 * attacker's domain. We probe by sending a bogus Host header and
 * checking whether the server echoes it into the response.
 */

import type { Recorder } from "../lib/record.ts";
import { probe } from "../lib/http.ts";

interface Ctx {
  baseUrls: string[];
  record: Recorder["record"];
}

const ATTACKER_HOST = "attacker.brightsec-probe.invalid";

export async function runHostHeaderProbes(ctx: Ctx): Promise<void> {
  for (const base of ctx.baseUrls) {
    const r = await probe({
      url: base,
      headers: { Host: ATTACKER_HOST, "X-Forwarded-Host": ATTACKER_HOST },
      followRedirects: false,
      timeoutMs: 5000,
    }).catch(() => null);
    if (!r) continue;

    const loc = r.headers["location"] ?? "";
    const reflectedInBody = r.body.includes(ATTACKER_HOST);
    const reflectedInLocation = loc.includes(ATTACKER_HOST);

    if (reflectedInBody || reflectedInLocation) {
      ctx.record({
        title: "Host header reflected into response (Host header injection surface)",
        severity: "medium",
        category: "injection",
        stack_area: "app-middleware",
        cwe: ["CWE-20", "CWE-644"],
        location: { url: base },
        evidence: {
          snippet:
            `Host: ${ATTACKER_HOST}\n` +
            (reflectedInLocation ? `→ Location header: ${loc}\n` : "") +
            (reflectedInBody ? `→ body contains the attacker host` : ""),
        },
        fix: {
          summary:
            "Never use `req.headers.host` to build URLs for emails, redirects, or canonical links. Use a configured `APP_URL` from env. Validate the Host header against an allowlist at the edge (Vercel can be configured to do this, or middleware.ts can enforce).",
        },
        tags: ["host-header", "email-injection"],
      });
    }
  }
}
