/**
 * info-disclosure.ts — check for common exposed artifacts.
 *
 * Each of these must NOT return 200 on a production-equivalent origin.
 * In dev, some of them will be false positives (e.g. /.well-known can
 * legitimately exist), so we severity-scale accordingly.
 */

import type { Recorder } from "../lib/record.ts";
import { probe, trimEvidence } from "../lib/http.ts";

interface Ctx {
  baseUrls: string[];
  record: Recorder["record"];
}

interface Target {
  path: string;
  severity: "high" | "medium" | "low" | "info";
  title: string;
  why?: string;
}

const TARGETS: Target[] = [
  { path: "/.env", severity: "high", title: "Possible .env exposure" },
  { path: "/.env.local", severity: "high", title: "Possible .env.local exposure" },
  { path: "/.env.production", severity: "high", title: "Possible .env.production exposure" },
  { path: "/.git/config", severity: "high", title: "Possible .git/config exposure" },
  { path: "/.git/HEAD", severity: "high", title: "Possible .git/HEAD exposure" },
  { path: "/composer.json", severity: "info", title: "composer.json exposed" },
  { path: "/package.json", severity: "low", title: "package.json reachable over HTTP" },
  { path: "/package-lock.json", severity: "low", title: "package-lock.json reachable over HTTP" },
  { path: "/.DS_Store", severity: "info", title: ".DS_Store exposed" },
  { path: "/server-status", severity: "info", title: "Apache server-status exposed" },
  { path: "/phpinfo.php", severity: "medium", title: "phpinfo exposed" },
  { path: "/wp-admin/", severity: "info", title: "WordPress admin probe hit" },
  { path: "/admin", severity: "info", title: "/admin route reachable" },
  { path: "/zadmin", severity: "info", title: "/zadmin route reachable", why: "bright-tale has a zadmin — ensure auth + rate limit" },
  { path: "/api/openapi.json", severity: "info", title: "OpenAPI spec exposed" },
  { path: "/api/swagger.json", severity: "info", title: "Swagger spec exposed" },
  { path: "/sitemap.xml", severity: "info", title: "sitemap.xml present" },
  // robots.txt + security.txt: expected defenses, not findings. Keep them
  // tracked but don't surface in the report unless content is surprising.
  { path: "/.well-known/security.txt", severity: "info", title: "security.txt present (good)" },
];

export async function runInfoDisclosureProbes(ctx: Ctx): Promise<void> {
  for (const base of ctx.baseUrls) {
    for (const t of TARGETS) {
      const url = base.replace(/\/$/, "") + t.path;
      const r = await probe({ url, followRedirects: false, timeoutMs: 5000 }).catch(() => null);
      if (!r) continue;
      // Only a real 200 is a finding. 301/302 to login, 401, 404 = fine.
      if (r.status === 200 && r.bodyBytes > 0) {
        const isHtml = /<!doctype|<html/i.test(r.body.slice(0, 200));
        // Strong positive: content has secret-like patterns or file-like structure.
        const looksSensitive =
          /\b(SECRET|TOKEN|PASSWORD|API[_-]?KEY|SUPABASE|AWS|STRIPE)\b.*=/.test(r.body) ||
          /^\[core\]|^ref: /m.test(r.body) ||  // .git/config / HEAD
          /"dependencies"\s*:\s*\{/.test(r.body); // package.json content

        const isPositive = looksSensitive || !isHtml;

        if (isPositive || t.severity === "info") {
          ctx.record({
            title: t.title + (isPositive ? "" : " (HTML response, probably the SPA fallback — verify manually)"),
            severity: isPositive ? t.severity : "info",
            category: "secrets",
            stack_area: "app-middleware",
            cwe: ["CWE-538"],
            owasp: ["A05:2021"],
            location: { url },
            evidence: {
              snippet: `GET ${url}  →  HTTP ${r.status}  ${r.bodyBytes} bytes\n\n` + trimEvidence(r.body, 400),
            },
            fix: t.why
              ? { summary: t.why }
              : {
                  summary:
                    "If legitimate (robots.txt, security.txt) ignore. Otherwise, block this path at the edge (middleware or Vercel rewrite) and remove the underlying file from the deploy.",
                },
            tags: ["info-disclosure"],
          });
        }
      }
    }
  }
}
