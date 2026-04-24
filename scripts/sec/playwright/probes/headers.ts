/**
 * headers.ts — security headers audit.
 *
 * Checks CSP, HSTS, X-Content-Type-Options, X-Frame-Options,
 * Referrer-Policy, Permissions-Policy, and exposure of fingerprinting
 * headers (Server, X-Powered-By).
 */

import type { Recorder } from "../lib/record.ts";
import { probe, formatResponse } from "../lib/http.ts";

interface Ctx {
  baseUrls: string[];
  record: Recorder["record"];
}

export async function runHeaderProbes(ctx: Ctx): Promise<void> {
  for (const base of ctx.baseUrls) {
    const r = await probe({ url: base, followRedirects: false }).catch(() => null);
    if (!r) continue;

    const h = r.headers;

    // CSP — accept either enforced or Report-Only (dev practice)
    const cspHeader = h["content-security-policy"] ?? h["content-security-policy-report-only"];
    const cspReportOnly = !h["content-security-policy"] && !!h["content-security-policy-report-only"];
    if (!cspHeader) {
      ctx.record({
        title: `Missing Content-Security-Policy on ${origin(base)}`,
        severity: "medium",
        category: "headers",
        stack_area: origin(base).includes("3001") ? "api-middleware" : "app-middleware",
        cwe: ["CWE-693", "CWE-1021"],
        owasp: ["A05:2021"],
        asvs: ["V14.4.1"],
        location: { url: base, method: "GET" },
        evidence: { response: formatResponse(r) },
        fix: {
          summary:
            "Add a restrictive CSP in Next.js `headers()` or `middleware.ts`. Start from: `default-src 'self'; script-src 'self' 'nonce-<per-request>'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` and allowlist specific third-parties from there.",
        },
        cvss: { vector: "CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:C/C:L/I:L/A:N", score: 4.8 },
        tags: ["headers", "xss-defense"],
      });
    } else {
      const csp = cspHeader;
      const problems: string[] = [];
      // In report-only (dev) mode, `unsafe-inline` + `unsafe-eval` are
      // legitimate because turbopack HMR needs them. We only flag these
      // when CSP is enforced (prod-equivalent).
      if (!cspReportOnly) {
        if (/'unsafe-inline'/.test(csp) && /script-src/.test(csp)) problems.push("script-src allows 'unsafe-inline'");
        if (/'unsafe-eval'/.test(csp)) problems.push("allows 'unsafe-eval'");
      }
      if (!/frame-ancestors/.test(csp)) problems.push("no frame-ancestors directive");
      if (!/base-uri/.test(csp)) problems.push("no base-uri directive");
      if (problems.length) {
        ctx.record({
          title: `Weak CSP on ${origin(base)}${cspReportOnly ? " (report-only mode)" : ""}`,
          severity: "low",
          category: "headers",
          stack_area: origin(base).includes("3001") ? "api-middleware" : "app-middleware",
          cwe: ["CWE-1021"],
          owasp: ["A05:2021"],
          location: { url: base },
          evidence: { snippet: `content-security-policy: ${csp}\n\nIssues:\n- ${problems.join("\n- ")}` },
          fix: { summary: "Replace 'unsafe-inline' with nonces; add explicit frame-ancestors 'none' and base-uri 'none'." },
          tags: ["headers", "csp"],
        });
      }
    }

    // HSTS — only meaningful over HTTPS. Flag for HTTPS origins and production-equivalent names.
    const isHttps = base.startsWith("https://");
    if (isHttps && !h["strict-transport-security"]) {
      ctx.record({
        title: `Missing Strict-Transport-Security on ${origin(base)}`,
        severity: "low",
        category: "headers",
        stack_area: "app-middleware",
        cwe: ["CWE-319"],
        owasp: ["A05:2021"],
        location: { url: base },
        evidence: { response: formatResponse(r) },
        fix: { summary: "Add `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` once all subdomains serve HTTPS." },
        tags: ["headers", "tls"],
      });
    }

    // X-Content-Type-Options
    if (!h["x-content-type-options"]) {
      ctx.record({
        title: `Missing X-Content-Type-Options on ${origin(base)}`,
        severity: "low",
        category: "headers",
        stack_area: "app-middleware",
        cwe: ["CWE-16"],
        location: { url: base },
        evidence: { snippet: `No 'X-Content-Type-Options: nosniff' header.` },
        fix: { summary: "Set `X-Content-Type-Options: nosniff` globally in middleware." },
        tags: ["headers"],
      });
    }

    // X-Frame-Options (or CSP frame-ancestors)
    const hasFraming = h["x-frame-options"] || /frame-ancestors/.test(h["content-security-policy"] ?? "");
    if (!hasFraming) {
      ctx.record({
        title: `No clickjacking protection on ${origin(base)}`,
        severity: "medium",
        category: "headers",
        stack_area: "app-middleware",
        cwe: ["CWE-1021"],
        location: { url: base },
        evidence: { snippet: "Neither X-Frame-Options nor CSP frame-ancestors is set." },
        fix: { summary: "Set `X-Frame-Options: DENY` or `CSP: frame-ancestors 'none'`." },
        tags: ["headers", "clickjacking"],
      });
    }

    // Referrer-Policy
    if (!h["referrer-policy"]) {
      ctx.record({
        title: `Missing Referrer-Policy on ${origin(base)}`,
        severity: "info",
        category: "headers",
        stack_area: "app-middleware",
        cwe: ["CWE-200"],
        location: { url: base },
        fix: { summary: "Set `Referrer-Policy: strict-origin-when-cross-origin` (or stricter)." },
        tags: ["headers", "privacy"],
      });
    }

    // Permissions-Policy
    if (!h["permissions-policy"]) {
      ctx.record({
        title: `Missing Permissions-Policy on ${origin(base)}`,
        severity: "info",
        category: "headers",
        stack_area: "app-middleware",
        location: { url: base },
        fix: {
          summary:
            "Set `Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=(), bluetooth=(), payment=(), magnetometer=(), gyroscope=()` — disable features you don't use.",
        },
        tags: ["headers"],
      });
    }

    // Fingerprinting headers
    if (h["server"]) {
      ctx.record({
        title: `Server header leaks tech: '${h["server"]}' on ${origin(base)}`,
        severity: "info",
        category: "headers",
        stack_area: "app-middleware",
        cwe: ["CWE-200"],
        location: { url: base },
        evidence: { snippet: `server: ${h["server"]}` },
        fix: { summary: "Strip the Server header in middleware or via the reverse proxy (Vercel usually hides it in prod; verify)." },
        tags: ["headers", "fingerprint"],
      });
    }
    if (h["x-powered-by"]) {
      ctx.record({
        title: `X-Powered-By header exposes framework: '${h["x-powered-by"]}' on ${origin(base)}`,
        severity: "info",
        category: "headers",
        stack_area: "app-middleware",
        cwe: ["CWE-200"],
        location: { url: base },
        evidence: { snippet: `x-powered-by: ${h["x-powered-by"]}` },
        fix: {
          summary:
            "Set `poweredByHeader: false` in `next.config.ts` to strip this header. Attackers use it to narrow CVE search.",
        },
        tags: ["headers", "fingerprint"],
      });
    }
  }
}

function origin(u: string): string {
  try {
    const { origin } = new URL(u);
    return origin;
  } catch {
    return u;
  }
}
