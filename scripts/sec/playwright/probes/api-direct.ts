/**
 * api-direct.ts — bright-tale specific.
 *
 * apps/api is supposed to reject requests that don't carry the
 * shared INTERNAL_API_KEY header. apps/app's middleware injects the key
 * before rewriting /api/* to apps/api. Anyone reaching apps/api directly
 * (port 3001) with no header, a wrong header, or a forged x-user-id must
 * get 401 — otherwise the whole trust boundary collapses.
 */

import type { Recorder } from "../lib/record.ts";
import { probe, formatRequest, formatResponse } from "../lib/http.ts";

interface Ctx {
  apiBase: string; // e.g. http://localhost:3001
  record: Recorder["record"];
}

const SAMPLE_PATHS = [
  "/api/projects",
  "/api/channels",
  "/api/templates",
  "/api/drafts",
  "/api/ideas",
  "/api/orgs",
];

export async function runApiDirectProbes(ctx: Ctx): Promise<void> {
  // 1. No header at all — every API path must return 401.
  for (const path of SAMPLE_PATHS) {
    const url = ctx.apiBase.replace(/\/$/, "") + path;
    const r = await probe({ url, followRedirects: false }).catch(() => null);
    if (!r) continue;

    if (r.status !== 401 && r.status !== 403 && r.status !== 404) {
      ctx.record({
        title: `apps/api ${path} does not require INTERNAL_API_KEY (status ${r.status})`,
        severity: "critical",
        category: "auth",
        stack_area: "api-middleware",
        cwe: ["CWE-306"],
        owasp: ["A01:2021", "A07:2021"],
        asvs: ["V4.1.1"],
        location: { url, method: "GET" },
        evidence: {
          request: formatRequest({ url, method: "GET" }),
          response: formatResponse(r),
        },
        fix: {
          summary:
            "apps/api/src/middleware/authenticate.ts must reject any /api/* request whose INTERNAL_API_KEY header is missing, mismatched, or short. Use crypto.timingSafeEqual on equal-length Buffers.",
        },
        cvss: { vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", score: 10.0 },
        tags: ["auth-bypass", "critical"],
      });
    }
  }

  // 2. Forged x-user-id — must be ignored. Hit a route that might be
  //    user-scoped; verify the response does NOT change vs baseline.
  //    (We can't assert content without credentials; only look for 200.)
  const path = "/api/projects";
  const url = ctx.apiBase.replace(/\/$/, "") + path;
  const forged = await probe({
    url,
    headers: { "x-user-id": "00000000-0000-0000-0000-000000000000" },
    followRedirects: false,
  }).catch(() => null);
  if (forged && forged.status === 200) {
    ctx.record({
      title: `apps/api ${path} returned 200 with forged x-user-id and no INTERNAL_API_KEY`,
      severity: "critical",
      category: "auth",
      stack_area: "api-middleware",
      cwe: ["CWE-290", "CWE-306"],
      owasp: ["A01:2021"],
      location: { url, method: "GET" },
      evidence: {
        request: formatRequest({ url, method: "GET", headers: { "x-user-id": "00000000-0000-0000-0000-000000000000" } }),
        response: formatResponse(forged),
      },
      fix: {
        summary:
          "Never derive user identity from request headers. apps/api must compute user_id from a Supabase session it validated itself. apps/app middleware must STRIP x-user-id and x-internal-key from the incoming request before injecting the real key.",
      },
      cvss: { vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", score: 10.0 },
      tags: ["auth-bypass", "idor-surface"],
    });
  }
}
