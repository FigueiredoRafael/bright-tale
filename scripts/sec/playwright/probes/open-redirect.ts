/**
 * open-redirect.ts — probe parameters commonly mis-used for redirects.
 *
 * Patterns tested: ?next=, ?returnTo=, ?redirect=, ?redirectTo=, ?continue=,
 * ?url=, ?callback=. For each, send an attacker domain and check whether
 * the server's Location header (or meta-refresh) points outside our origin.
 */

import type { Recorder } from "../lib/record.ts";
import { probe } from "../lib/http.ts";

interface Ctx {
  baseUrls: string[];
  record: Recorder["record"];
}

const ATTACKER = "https://attacker.example.com/phish";
const PARAMS = ["next", "returnTo", "return_to", "redirect", "redirectTo", "continue", "url", "callback", "dest"];
const PATHS = ["/", "/auth/login", "/auth/signup", "/auth/logout", "/api/auth/callback"];

export async function runOpenRedirectProbes(ctx: Ctx): Promise<void> {
  for (const base of ctx.baseUrls) {
    for (const path of PATHS) {
      for (const param of PARAMS) {
        const url = `${base}${path}?${param}=${encodeURIComponent(ATTACKER)}`;
        const r = await probe({ url, followRedirects: false, timeoutMs: 5000 }).catch(() => null);
        if (!r) continue;

        const location = r.headers["location"];
        const isRedirect = r.status >= 300 && r.status < 400 && !!location;
        const metaRefresh = r.body.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+url=([^"'>]+)/i);

        const target = isRedirect ? location : metaRefresh?.[1] ?? null;
        if (target && pointsOutside(target, base)) {
          ctx.record({
            title: `Open redirect via ${path}?${param}=`,
            severity: "medium",
            category: "api",
            stack_area: "api-route",
            cwe: ["CWE-601"],
            owasp: ["A01:2021"],
            asvs: ["V5.1.5"],
            location: { url, method: "GET" },
            evidence: {
              request: `GET ${url}`,
              response: `HTTP ${r.status}\nLocation: ${target}\n\nredirected outside origin ${origin(base)}`,
            },
            fix: {
              summary:
                "Never redirect to a user-supplied URL. Accept only paths ('/…') or an allowlisted host set. Validate by parsing the URL and checking `url.origin === config.origin`.",
            },
            cvss: { vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:L/A:N", score: 4.3 },
            tags: ["phishing", "redirect"],
          });
        }
      }
    }
  }
}

function origin(u: string): string {
  try {
    return new URL(u).origin;
  } catch {
    return u;
  }
}

function pointsOutside(target: string, base: string): boolean {
  try {
    const t = new URL(target, base);
    const b = new URL(base);
    return t.origin !== b.origin;
  } catch {
    return false;
  }
}
