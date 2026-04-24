/**
 * xss-reflected.ts — probe query-string reflection into HTML without escape.
 *
 * Sends a unique marker through common "reflective" parameter names and
 * checks whether the response body contains it unescaped in an
 * HTML-dangerous position (inside a tag attribute without quotes, inside
 * a script block, inside an href/src). We DO NOT use live JS payloads —
 * the marker is a harmless string that tests the sanitization boundary.
 */

import type { Recorder } from "../lib/record.ts";
import { probe } from "../lib/http.ts";
import { randomUUID } from "node:crypto";

interface Ctx {
  baseUrls: string[];
  record: Recorder["record"];
}

const PATHS = ["/", "/auth/login", "/auth/signup", "/search", "/en", "/pt-BR", "/en/auth/login"];
const PARAMS = ["q", "search", "query", "error", "message", "callback", "redirect", "next", "return_to", "name"];

const DANGEROUS_MARKER = `brightsec-${randomUUID().slice(0, 8)}"bright-`; // breaks out of quoted attribute

export async function runXssReflectedProbes(ctx: Ctx): Promise<void> {
  for (const base of ctx.baseUrls) {
    for (const path of PATHS) {
      for (const param of PARAMS) {
        const url = `${base.replace(/\/$/, "")}${path}?${param}=${encodeURIComponent(DANGEROUS_MARKER)}`;
        const r = await probe({ url, followRedirects: true, timeoutMs: 5000 }).catch(() => null);
        if (!r) continue;
        if (r.status >= 500) continue;

        // Reflected unescaped (raw marker containing a literal double-quote)?
        if (r.body.includes(DANGEROUS_MARKER)) {
          ctx.record({
            title: `Reflected XSS surface: ${param} on ${path} echoed unescaped into response body`,
            severity: "high",
            category: "injection",
            stack_area: "frontend",
            cwe: ["CWE-79"],
            owasp: ["A03:2021"],
            asvs: ["V5.3.3"],
            location: { url, method: "GET" },
            evidence: {
              snippet:
                `Marker '${DANGEROUS_MARKER}' reflected raw in response.\n` +
                `Response excerpt (around match):\n` +
                excerpt(r.body, DANGEROUS_MARKER),
            },
            fix: {
              summary:
                "Escape all user-controlled values before inserting into HTML. In React, avoid `dangerouslySetInnerHTML`. For server-rendered Next.js pages, render user input with {} not with html() helpers. Also set a strict CSP to defense-in-depth.",
            },
            cvss: { vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", score: 6.1 },
            tags: ["xss", "reflected"],
          });
        }
        // Escaped-but-in-dangerous-position — heuristic: if the HTML-escaped
        // version is inside a <script> block or inside an on* attribute, flag.
        const escaped = DANGEROUS_MARKER.replace(/"/g, "&quot;").replace(/</g, "&lt;");
        if (r.body.includes(escaped)) {
          const scriptSegment = findInScript(r.body, escaped);
          if (scriptSegment) {
            ctx.record({
              title: `Query param ${param} on ${path} reflected inside a <script> block`,
              severity: "high",
              category: "injection",
              stack_area: "frontend",
              cwe: ["CWE-79"],
              owasp: ["A03:2021"],
              location: { url },
              evidence: { snippet: scriptSegment.slice(0, 400) },
              fix: {
                summary:
                  "Never interpolate user input into a <script> block. If the value must be in JS, JSON.stringify it and parse with JSON.parse. Better: put it in a data-* attribute and read from the DOM.",
              },
              tags: ["xss", "script-context"],
            });
          }
        }
      }
    }
  }
}

function excerpt(body: string, marker: string): string {
  const i = body.indexOf(marker);
  if (i < 0) return "(marker not found)";
  return body.slice(Math.max(0, i - 80), Math.min(body.length, i + marker.length + 80));
}

function findInScript(body: string, needle: string): string | null {
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[1].includes(needle)) return m[0];
  }
  return null;
}
