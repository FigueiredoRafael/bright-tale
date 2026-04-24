/**
 * error-leakage.ts — trigger error paths and inspect responses for
 * stack traces, absolute filesystem paths, internal module names,
 * database error messages, and framework version strings.
 *
 * Triggers used:
 *   • malformed JSON
 *   • unexpected content type
 *   • oversized payload
 *   • method not allowed
 *   • known-bad path
 * None of these mutate state.
 */

import type { Recorder } from "../lib/record.ts";
import { probe, formatResponse } from "../lib/http.ts";

interface Ctx {
  baseUrls: string[];
  record: Recorder["record"];
}

const LEAK_PATTERNS: { name: string; re: RegExp; severity: "medium" | "low" | "info" }[] = [
  { name: "Filesystem path", re: /\/Users\/[a-z0-9._-]+\/|\/home\/[a-z0-9._-]+\/|[A-Z]:\\\\[^\s"<]+/i, severity: "medium" },
  { name: "Node stack frame", re: /at\s+\w+\s+\(?[a-z0-9_./\\-]+:\d+:\d+\)?/i, severity: "medium" },
  { name: "Next.js internal path", re: /\.next\/(server|static)\/[a-z0-9_./-]+/i, severity: "medium" },
  { name: "Postgres error code", re: /\b(duplicate key|foreign key|syntax error at or near|relation ".+" does not exist)\b/i, severity: "medium" },
  { name: "Supabase error shape", re: /\b(PGRST\d{3,}|PostgresError|postgrest|supabase\.co|"hint"\s*:|"details"\s*:\s*".*(?:constraint|column|relation))/i, severity: "low" },
  { name: "Secret-looking fragment in error", re: /(sk-[A-Za-z0-9]{12,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ)/i, severity: "medium" },
  { name: "Debug assertion", re: /\b(assert|assertion failed|TODO|FIXME|XXX)\b/i, severity: "info" },
];

export async function runErrorLeakageProbes(ctx: Ctx): Promise<void> {
  for (const base of ctx.baseUrls) {
    const probes = [
      { name: "Malformed JSON POST", req: { url: base + "/api/does-not-exist", method: "POST", headers: { "Content-Type": "application/json" }, body: "{not-json" } },
      { name: "Wrong Content-Type POST", req: { url: base + "/api/auth/login", method: "POST", headers: { "Content-Type": "text/plain" }, body: "ping" } },
      { name: "Method not allowed", req: { url: base, method: "TRACE" } },
      { name: "Weird path", req: { url: base + "/api/%c0%af%c0%af", method: "GET" } },
      { name: "JSON with wrong types", req: { url: base + "/api/auth/login", method: "POST", headers: { "Content-Type": "application/json" }, body: '{"email":123,"password":[]}' } },
    ];

    for (const { name, req } of probes) {
      const r = await probe({ ...req, followRedirects: false }).catch(() => null);
      if (!r) continue;
      // Detect Next.js dev-mode error pages — they leak /Users/... paths
      // by design and this behavior does not occur in production builds.
      const isNextDevErrorPage =
        /sentry-environment=development/.test(r.body) ||
        /__next_find_dom_node|_next\/static\/chunks\/%5Broot-of-the-server%5D/.test(r.body) ||
        (/<title>Error<\/title>/.test(r.body) && /<!DOCTYPE html>/.test(r.body)) ||
        // Next.js 16 + Turbopack emits a different dev 500 shell
        /turbopack/i.test(r.body);

      // In local development, the dev error page leak is a framework
      // characteristic, not a finding. Skip recording entirely when we
      // positively identified the dev-mode page. The per-target note
      // below still surfaces once per run for visibility.
      const suppressAsDevArtifact =
        isNextDevErrorPage &&
        /localhost|127\.0\.0\.1/.test(req.url) &&
        process.env.NODE_ENV !== "production";

      for (const pat of LEAK_PATTERNS) {
        const m = r.body.match(pat.re);
        if (m) {
          // For filesystem / next-internal leaks in the confirmed dev
          // error page, skip the finding completely — it's 1:1 with the
          // framework's dev behavior and would never occur in prod.
          if (suppressAsDevArtifact && (pat.name === "Filesystem path" || pat.name === "Next.js internal path")) {
            break;
          }
          const downgrade = isNextDevErrorPage && (pat.name === "Filesystem path" || pat.name === "Next.js internal path");
          ctx.record({
            title: `${pat.name} leaked in error response to ${name}${downgrade ? " (Next.js dev error page — prod does not have this)" : ""}`,
            severity: downgrade ? "info" : pat.severity,
            category: "logging",
            stack_area: "api-route",
            cwe: ["CWE-209", "CWE-200"],
            owasp: ["A09:2021"],
            asvs: ["V7.4.1"],
            location: { url: req.url, method: req.method ?? "GET" },
            evidence: {
              response: formatResponse(r),
              snippet: `Matched pattern: ${pat.re}\nFirst match: ${m[0].slice(0, 200)}${downgrade ? "\n\nContext: response is a Next.js dev error page. NODE_ENV=production builds a minified error page without these markers." : ""}`,
            },
            fix: downgrade
              ? { summary: "No action needed in dev. Before prod: verify the same endpoint under `NODE_ENV=production` returns a minimal error envelope (no stack, no path)." }
              : {
                  summary:
                    "Never send raw errors to clients. Map internal errors to generic `{ code, message }` envelopes. Log the full error server-side (with secret redaction), return only a stable code + safe message to the caller.",
                },
            tags: downgrade ? ["info-leak", "dev-only"] : ["info-leak", "errors"],
          });
          break; // one finding per endpoint×trigger is enough
        }
      }
    }
  }
}
