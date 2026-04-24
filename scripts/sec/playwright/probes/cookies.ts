/**
 * cookies.ts — audit Set-Cookie attributes.
 *
 * Hits the root URL and likely auth endpoints, parses every Set-Cookie,
 * flags cookies that are missing Secure, HttpOnly, SameSite, or that
 * lack the __Host- prefix when appropriate.
 */

import type { Recorder } from "../lib/record.ts";
import { probe } from "../lib/http.ts";

interface Ctx {
  baseUrls: string[];
  record: Recorder["record"];
}

interface ParsedCookie {
  name: string;
  value: string;
  attrs: Record<string, string | true>;
  raw: string;
}

function parseSetCookie(raw: string): ParsedCookie {
  const parts = raw.split(";").map((p) => p.trim());
  const [nameVal] = parts;
  const eq = nameVal.indexOf("=");
  const name = eq >= 0 ? nameVal.slice(0, eq) : nameVal;
  const value = eq >= 0 ? nameVal.slice(eq + 1) : "";
  const attrs: Record<string, string | true> = {};
  for (const a of parts.slice(1)) {
    const ae = a.indexOf("=");
    const k = (ae >= 0 ? a.slice(0, ae) : a).toLowerCase();
    const v = ae >= 0 ? a.slice(ae + 1) : true;
    attrs[k] = v;
  }
  return { name, value, attrs, raw };
}

/** Node fetch collapses multiple Set-Cookie headers into one comma-joined string.
 *  Split on comma-followed-by-token= without splitting on commas inside Expires dates. */
function splitSetCookies(header: string | undefined): string[] {
  if (!header) return [];
  return header.split(/,(?=\s*[A-Za-z0-9_-]+=)/g).map((s) => s.trim());
}

export async function runCookieProbes(ctx: Ctx): Promise<void> {
  for (const base of ctx.baseUrls) {
    const r = await probe({ url: base, followRedirects: true }).catch(() => null);
    if (!r) continue;
    const cookieHeader = r.headers["set-cookie"];
    const cookies = splitSetCookies(cookieHeader).map(parseSetCookie);

    for (const c of cookies) {
      const issues: string[] = [];
      const looksLikeSession =
        /sess|auth|sb-|token|jwt|sid/i.test(c.name) ||
        (typeof c.value === "string" && c.value.length > 50);

      if (!("secure" in c.attrs) && base.startsWith("https://")) issues.push("no Secure (HTTPS origin)");
      if (!("httponly" in c.attrs) && looksLikeSession) issues.push("no HttpOnly (session-looking cookie)");
      const samesite = c.attrs["samesite"];
      if (!samesite) issues.push("no SameSite attribute");
      else if (typeof samesite === "string" && /none/i.test(samesite) && !("secure" in c.attrs))
        issues.push("SameSite=None without Secure");
      if (looksLikeSession && !c.name.startsWith("__Host-") && !c.name.startsWith("__Secure-"))
        issues.push("session cookie without __Host- / __Secure- prefix");

      if (issues.length) {
        ctx.record({
          title: `Cookie '${c.name}' on ${originOf(base)} is missing hardening attributes`,
          severity: looksLikeSession ? "medium" : "low",
          category: "auth",
          stack_area: "api-route",
          cwe: ["CWE-614", "CWE-1004"],
          owasp: ["A05:2021"],
          asvs: ["V3.4.1", "V3.4.2", "V3.4.3"],
          location: { url: base },
          evidence: { snippet: `Set-Cookie: ${c.raw}\n\nIssues:\n- ${issues.join("\n- ")}` },
          fix: {
            summary:
              "Session cookies must be Secure + HttpOnly + SameSite=Strict (or Lax if cross-site OAuth is needed) + __Host- prefix. Non-session cookies at minimum need Secure + SameSite.",
          },
          tags: ["auth", "cookies"],
        });
      }
    }
  }
}

function originOf(u: string): string {
  try {
    return new URL(u).origin;
  } catch {
    return u;
  }
}
