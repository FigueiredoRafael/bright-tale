/**
 * agent-prompts.ts — probes targeting the agent_prompts surface.
 *
 * Treats the agent_prompts table / admin pages as the crown jewel: the
 * business rules that make the product different from a thin GPT wrapper.
 *
 * Unauth-only probes (do not require credentials):
 *   1. /api/agents* over internet-exposed origins (must be 401).
 *   2. /admin/agents* must redirect to login, not leak prompt content.
 *   3. Response headers on the admin agents editor carry Cache-Control: no-store.
 *   4. Static / SSR artifacts on the public pages do not contain phrases
 *      typical of a system prompt (anti-leak heuristic).
 *
 * Authenticated probes (see admin-authenticated.ts for the pattern) are a
 * follow-up once a test admin role is set up — they would test:
 *   5. Per-session read rate limit.
 *   6. Step-up MFA requirement on writes.
 *   7. Audit log row appears after every read.
 */

import type { Recorder } from "../lib/record.ts";
import { probe, formatResponse } from "../lib/http.ts";

interface Ctx {
  appBase: string;      // 3000
  apiBase: string;      // 3001
  webBase: string;      // 3002
  adminSlug?: string;
  record: Recorder["record"];
}

const AGENT_PATHS_API = ["/api/agents", "/api/agent-prompts", "/api/agents/_all"];
const PROMPT_PHRASES = [
  "You are an AI assistant",
  "You are a helpful",
  "You are an expert",
  "system prompt",
  "ignore previous instructions",
  "# Role",
  "## Instructions",
];

export async function runAgentPromptsProbes(ctx: Ctx): Promise<void> {
  const slug = ctx.adminSlug ?? "admin";

  // ── 1. /api/agents on apps/api and apps/app must be 401 without INTERNAL_API_KEY.
  for (const base of [ctx.apiBase, ctx.appBase]) {
    for (const p of AGENT_PATHS_API) {
      const url = base.replace(/\/$/, "") + p;
      const r = await probe({ url, followRedirects: false, timeoutMs: 5000 }).catch(() => null);
      if (!r) continue;
      if (r.status === 200 && r.bodyBytes > 500) {
        ctx.record({
          title: `Agent prompts endpoint ${p} returned 200 without authentication (possible IP leak surface)`,
          severity: "critical",
          category: "auth",
          stack_area: "api-route",
          cwe: ["CWE-306", "CWE-200"],
          owasp: ["A01:2021", "A07:2021"],
          location: { url, method: "GET" },
          evidence: { response: formatResponse(r) },
          fix: {
            summary:
              "The agent prompts API is the crown jewel. It must reject (401) any request that doesn't carry INTERNAL_API_KEY AND map to an admin:prompts session. If this endpoint exists for internal use only, unexpose it from the external rewrite surface entirely.",
          },
          cvss: { vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:N", score: 9.3 },
          tags: ["agent-prompts", "crown-jewel", "critical"],
          source: "playwright:agent-prompts",
        });
      }
    }
  }

  // ── 2. /admin/agents protected-route behavior.
  const webBase = ctx.webBase.replace(/\/$/, "");
  const adminAgentsUrl = `${webBase}/${slug}/agents`;
  const r = await probe({ url: adminAgentsUrl, followRedirects: false, timeoutMs: 5000 }).catch(() => null);
  if (r) {
    if (r.status === 200 && r.bodyBytes > 2000) {
      ctx.record({
        title: "Admin /agents route returned 200 to unauthenticated request (prompts may be exposed)",
        severity: "critical",
        category: "auth",
        stack_area: "app-middleware",
        cwe: ["CWE-285"],
        owasp: ["A01:2021"],
        location: { url: adminAgentsUrl, method: "GET" },
        evidence: { response: formatResponse(r) },
        fix: { summary: "Middleware must redirect unauth to /admin/login. Until SEC-002 lands, this is the single critical control protecting the prompts." },
        cvss: { vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", score: 10.0 },
        tags: ["agent-prompts", "admin", "critical"],
        source: "playwright:agent-prompts",
      });
    }

    // Cache-Control hygiene for admin pages that touch the prompts.
    const cc = r.headers["cache-control"] ?? "";
    if (!/no-store/i.test(cc)) {
      ctx.record({
        title: "Admin /agents response lacks Cache-Control: no-store",
        severity: "medium",
        category: "headers",
        stack_area: "app-middleware",
        cwe: ["CWE-524"],
        location: { url: adminAgentsUrl },
        evidence: { snippet: `cache-control: ${cc || "(not set)"}` },
        fix: { summary: "Pages that render prompts must be Cache-Control: no-store, no-cache, must-revalidate, private. Prevents any intermediary from retaining prompt content." },
        tags: ["agent-prompts", "cache"],
        source: "playwright:agent-prompts",
      });
    }
  }

  // ── 3. Heuristic: check that public pages on app origin do not accidentally
  //    embed prompt-looking content in their initial HTML.
  const publicProbes = [ctx.appBase, ctx.webBase];
  for (const base of publicProbes) {
    const r = await probe({ url: base, followRedirects: true, timeoutMs: 5000 }).catch(() => null);
    if (!r) continue;
    const hits: string[] = [];
    for (const phrase of PROMPT_PHRASES) {
      if (r.body.toLowerCase().includes(phrase.toLowerCase())) hits.push(phrase);
    }
    if (hits.length >= 2) {
      ctx.record({
        title: `Public origin ${origin(base)} SSR output contains prompt-like phrases (${hits.length} hits)`,
        severity: "medium",
        category: "secrets",
        stack_area: "frontend",
        cwe: ["CWE-200"],
        location: { url: base },
        evidence: { snippet: `Phrases matched: ${hits.join(", ")}.\nManual review: verify whether this is marketing copy (ok) or an agent system prompt inadvertently embedded (not ok).` },
        fix: { summary: "Any SSR page that needs prompt content must fetch it client-side after auth — never include prompt strings in the initial HTML payload that any scraper can grab." },
        tags: ["agent-prompts", "heuristic"],
        source: "playwright:agent-prompts",
      });
    }
  }
}

function origin(u: string): string {
  try { return new URL(u).origin; } catch { return u; }
}
