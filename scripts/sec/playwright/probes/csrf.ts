/**
 * csrf.ts — probe state-changing endpoints for CSRF defenses.
 *
 * Strategy:
 *   Send a POST to likely mutation endpoints with
 *     Origin: https://attacker.example
 *     Referer: https://attacker.example
 *   and NO CSRF token. A server that accepts (status < 400 other than auth
 *   failure, or 4xx that is not specifically CSRF-related) is missing
 *   origin validation.
 *
 * Note: INTERNAL_API_KEY gate on apps/api means most /api/* on port 3001
 * returns 401 immediately — that's a correct defense-in-depth layer. We
 * test via apps/app (port 3000) which proxies to apps/api.
 */

import type { Recorder } from "../lib/record.ts";
import { probe, formatRequest, formatResponse } from "../lib/http.ts";

interface Ctx {
  appBase: string;
  record: Recorder["record"];
}

const MUTATION_PATHS = [
  "/api/projects",
  "/api/channels",
  "/api/ideas",
  "/api/drafts",
  "/api/templates",
  "/api/publishing/wordpress",
];

export async function runCsrfProbes(ctx: Ctx): Promise<void> {
  for (const path of MUTATION_PATHS) {
    const url = ctx.appBase.replace(/\/$/, "") + path;
    const r = await probe({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
        Referer: "https://attacker.example/evil",
      },
      body: JSON.stringify({ __csrf_probe: true }),
      followRedirects: false,
    }).catch(() => null);
    if (!r) continue;

    // Accept statuses that indicate the request got through validation of
    // origin — 200, 201, or 400 (validation failed but route accepted us).
    // 401/403/404/405 are fine.
    const gatekeptByAuth = [401, 403].includes(r.status);
    const gatekeptByMissing = r.status === 404 || r.status === 405;
    const gatekeptByCsrf =
      /csrf|origin|referer|forbidden/i.test(r.body) && (r.status === 400 || r.status === 403);

    if (!gatekeptByAuth && !gatekeptByMissing && !gatekeptByCsrf && r.status < 500) {
      ctx.record({
        title: `POST ${path} accepted a cross-origin request with no CSRF protection (status ${r.status})`,
        severity: "medium",
        category: "csrf",
        stack_area: "api-route",
        cwe: ["CWE-352"],
        owasp: ["A01:2021"],
        asvs: ["V13.2.3"],
        location: { url, method: "POST" },
        evidence: {
          request: formatRequest({
            url,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: "https://attacker.example",
              Referer: "https://attacker.example/evil",
            },
            body: '{"__csrf_probe":true}',
          }),
          response: formatResponse(r),
        },
        fix: {
          summary:
            "Reject any state-changing request (POST/PUT/PATCH/DELETE) whose Origin or Referer is not in the allowed origin list. Combine with SameSite=Strict on session cookies, and a double-submit CSRF token for browsers that don't support SameSite.",
        },
        cvss: { vector: "CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:U/C:L/I:L/A:N", score: 4.2 },
        tags: ["csrf", "cross-origin"],
      });
    }
  }
}
