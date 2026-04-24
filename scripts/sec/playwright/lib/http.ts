/**
 * http.ts — thin fetch wrapper used by all HTTP probes.
 *
 * Design choices:
 *  - Always send our identifying User-Agent so our traffic is distinguishable
 *    from real-attacker traffic in any WAF/log review.
 *  - Never follow redirects automatically — we want to inspect the redirect
 *    response itself (for open-redirect, host-header, etc.).
 *  - Default timeout 10s — probes that need more must override explicitly.
 *  - Track timing with node:perf_hooks for timing-side-channel probes.
 */

import { performance } from "node:perf_hooks";

export const UA =
  "BrightSec/1.0 (authorized-pentest; owner=socials@brightcurios.com)";

export interface ProbeResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  bodyBytes: number;
  elapsedMs: number;
  url: string;
  redirected: boolean;
}

export interface ProbeRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | URLSearchParams | FormData;
  timeoutMs?: number;
  followRedirects?: boolean;
}

export async function probe(req: ProbeRequest): Promise<ProbeResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 10_000);

  // Auto-attach authorized-test-traffic bypass header unless caller opted
  // out (rate-limit probe does this to validate the limiter actually fires).
  const { bypassHeaders } = await import("./bypass-sign.ts");
  const pathForSig = (() => {
    try { return new URL(req.url).pathname; } catch { return "/"; }
  })();
  const autoHeaders = req.headers?.["X-BrightSec-Skip-Bypass"] ? {} : bypassHeaders(pathForSig);

  const start = performance.now();
  try {
    const resp = await fetch(req.url, {
      method: req.method ?? "GET",
      headers: { "User-Agent": UA, ...autoHeaders, ...(req.headers ?? {}) },
      body: req.body as BodyInit | undefined,
      redirect: req.followRedirects === false ? "manual" : "follow",
      signal: controller.signal,
    });

    const body = await resp.text();
    const elapsedMs = performance.now() - start;

    const headers: Record<string, string> = {};
    resp.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });

    return {
      status: resp.status,
      ok: resp.ok,
      headers,
      body,
      bodyBytes: Buffer.byteLength(body),
      elapsedMs,
      url: resp.url,
      redirected: resp.redirected,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function timedProbe(
  req: ProbeRequest,
  trials: number,
): Promise<number[]> {
  const timings: number[] = [];
  for (let i = 0; i < trials; i++) {
    try {
      const r = await probe(req);
      timings.push(r.elapsedMs);
    } catch {
      timings.push(NaN);
    }
    // small gap to avoid saturating the dev server with back-to-back requests
    await new Promise((r) => setTimeout(r, 25));
  }
  return timings.filter((n) => Number.isFinite(n));
}

/** Trim a response body for evidence embedding (avoid multi-MB strings in reports). */
export function trimEvidence(s: string, max = 1200): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n… [${s.length - max} bytes truncated]`;
}

/** Format a request for evidence. */
export function formatRequest(req: ProbeRequest): string {
  const lines = [`${req.method ?? "GET"} ${req.url}`];
  const hdrs = { "User-Agent": UA, ...(req.headers ?? {}) };
  for (const [k, v] of Object.entries(hdrs)) lines.push(`${k}: ${v}`);
  if (req.body) {
    lines.push("");
    lines.push(typeof req.body === "string" ? req.body : String(req.body));
  }
  return lines.join("\n");
}

/** Format a response for evidence. */
export function formatResponse(r: ProbeResponse): string {
  const lines = [`HTTP ${r.status}  (${r.elapsedMs.toFixed(1)}ms, ${r.bodyBytes} bytes)`];
  for (const [k, v] of Object.entries(r.headers)) lines.push(`${k}: ${v}`);
  lines.push("");
  lines.push(trimEvidence(r.body));
  return lines.join("\n");
}
