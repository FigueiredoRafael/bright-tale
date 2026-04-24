/**
 * parse-scanner.ts — translate raw scanner outputs into our Finding schema.
 *
 * Supported sources (the most common ones written by scripts/sec/run-pentest.sh):
 *   - nuclei       (jsonl)  ← each line is a template match
 *   - gitleaks     (json)   ← .findings
 *   - trufflehog   (json)   ← newline-delimited, may be empty
 *   - zap-baseline (json)   ← OWASP passive sweep, .site[].alerts
 *   - nikto        (json)   ← .vulnerabilities
 *   - httpx        (jsonl/json) ← informational baseline; not a finding source
 *
 * Unknown / unparseable files are skipped with a warning.
 * All string fields are redacted of secret-looking substrings via
 * the shared redactor in ../../render-report.ts is NOT a dep — we trust
 * that gitleaks/trufflehog already returned hashes when invoked with
 * --redact. Here we just trim.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { Finding } from "./record.ts";

export function parseAllScanner(rawDir: string): Finding[] {
  const findings: Finding[] = [];
  let files: string[];
  try {
    files = readdirSync(resolve(rawDir));
  } catch {
    return findings;
  }
  for (const f of files) {
    const path = resolve(rawDir, f);
    try {
      if (/^nuclei-.*\.jsonl$/.test(f)) findings.push(...parseNuclei(path));
      else if (/^gitleaks-.*\.json$/.test(f)) findings.push(...parseGitleaks(path));
      else if (/^trufflehog-.*\.json$/.test(f)) findings.push(...parseTrufflehog(path));
      else if (/^zap-.*\.json$/.test(f)) findings.push(...parseZap(path));
      else if (/^nikto-.*\.json$/.test(f)) findings.push(...parseNikto(path));
    } catch (e) {
      // Parser errors are logged but never crash the run.
      console.warn(`parse-scanner: failed on ${f}: ${(e as Error).message}`);
    }
  }
  return findings;
}

// ── nuclei ──────────────────────────────────────────────────────────────────
function parseNuclei(path: string): Finding[] {
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  const out: Finding[] = [];
  for (const line of lines) {
    let r: Record<string, unknown>;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    const info = (r.info ?? {}) as Record<string, unknown>;
    const classification = (info.classification ?? {}) as Record<string, unknown>;
    const severity = normalizeSeverity((info.severity as string) ?? "info");
    const templateId = (r["template-id"] as string) ?? (r.templateID as string) ?? "unknown";
    const matched = (r["matched-at"] as string) ?? (r.host as string) ?? "";
    const name = (info.name as string) ?? templateId;

    out.push({
      id: `NUCLEI-${templateId}-${sha8(matched)}`,
      title: `${name} (${templateId})`,
      severity,
      category: mapCategoryFromTags(info.tags as string[] | string | undefined),
      stack_area: inferStackArea(matched),
      cwe: toArray(classification["cwe-id"]),
      cvss: typeof classification["cvss-metrics"] === "string"
        ? { vector: classification["cvss-metrics"] as string, score: (classification["cvss-score"] as number) ?? 0 }
        : undefined,
      location: { url: matched, method: "GET" },
      evidence: {
        snippet:
          `Template: ${templateId}\n` +
          `Matched-at: ${matched}\n` +
          (info.description ? `Description: ${info.description}\n` : "") +
          ((r as { request?: string }).request ? `\nRequest:\n${(r as { request: string }).request.slice(0, 800)}` : ""),
      },
      references: toArray(info.reference),
      tags: [...toArray(info.tags), "nuclei"],
      source: "nuclei",
      discovered_at: new Date().toISOString(),
    });
  }
  return out;
}

// ── gitleaks ────────────────────────────────────────────────────────────────
function parseGitleaks(path: string): Finding[] {
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return [];
  let arr: Record<string, unknown>[];
  try {
    const parsed = JSON.parse(raw);
    arr = Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
  return arr.map((r) => ({
    id: `GITLEAKS-${(r.RuleID as string) ?? "unknown"}-${sha8(String(r.File ?? "") + ":" + String(r.StartLine ?? 0))}`,
    title: `Secret detected in repo: ${r.Description ?? r.RuleID ?? "unknown"}`,
    severity: "high" as const,
    category: "secrets",
    stack_area: "secrets-in-repo",
    cwe: ["CWE-798", "CWE-200"],
    owasp: ["A07:2021"],
    location: { file: r.File as string, line: Number(r.StartLine ?? 0) },
    evidence: {
      snippet:
        `Rule: ${r.RuleID}\n` +
        `File: ${r.File}:${r.StartLine}\n` +
        `Match: ${String(r.Match ?? "").slice(0, 80)}\n` +
        `Fingerprint: ${r.Fingerprint ?? "(none)"}\n`,
    },
    fix: { summary: "Rotate the leaked secret immediately, purge from git history (git filter-repo or BFG), and load it via env var instead of source." },
    tags: ["secrets", "gitleaks"],
    source: "gitleaks",
    discovered_at: new Date().toISOString(),
  }));
}

// ── trufflehog ──────────────────────────────────────────────────────────────
function parseTrufflehog(path: string): Finding[] {
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return [];
  // trufflehog emits either NDJSON or an array.
  const records: Record<string, unknown>[] = [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) records.push(...parsed);
    } catch {/* ignore */}
  } else {
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try { records.push(JSON.parse(line)); } catch {/* ignore */}
    }
  }
  return records.map((r) => ({
    id: `TRUFFLE-${(r.DetectorName as string) ?? "unknown"}-${sha8(JSON.stringify(r.SourceMetadata ?? {}))}`,
    title: `Verified secret leaked in git history: ${r.DetectorName ?? "unknown"}`,
    severity: "critical" as const,
    category: "secrets",
    stack_area: "secrets-in-repo",
    cwe: ["CWE-798"],
    owasp: ["A07:2021"],
    location: { file: String(((r.SourceMetadata as { Data?: { Git?: { file?: string } } })?.Data?.Git?.file ?? "")) },
    evidence: { snippet: `Detector: ${r.DetectorName}\nVerified: ${r.Verified}\nSource: ${JSON.stringify(r.SourceMetadata).slice(0, 400)}` },
    fix: { summary: "Rotate immediately — this was flagged as ACTIVE (verified) by trufflehog. Any attacker scanning your public repo has it already. Purge git history after rotation." },
    tags: ["secrets", "trufflehog", "verified"],
    source: "trufflehog",
    discovered_at: new Date().toISOString(),
  }));
}

// ── zap-baseline ────────────────────────────────────────────────────────────
function parseZap(path: string): Finding[] {
  const raw = readFileSync(path, "utf8");
  let data: { site?: Array<{ alerts?: Array<Record<string, unknown>> }> };
  try { data = JSON.parse(raw); } catch { return []; }
  const out: Finding[] = [];
  for (const site of data.site ?? []) {
    for (const alert of site.alerts ?? []) {
      const sev = normalizeSeverity((alert.riskdesc as string) ?? "info");
      const instances = (alert.instances as Array<{ uri?: string; method?: string }>) ?? [];
      const firstInst = instances[0] ?? {};
      out.push({
        id: `ZAP-${(alert.pluginid as string) ?? "unknown"}-${sha8((alert.name as string) ?? "")}`,
        title: `ZAP: ${alert.name}`,
        severity: sev,
        category: "api",
        stack_area: "api-route",
        cwe: alert.cweid ? [`CWE-${alert.cweid}`] : undefined,
        location: { url: firstInst.uri, method: firstInst.method },
        evidence: { snippet: `${alert.desc ?? ""}\n\nSolution: ${alert.solution ?? ""}`.slice(0, 1200) },
        references: toArray(alert.reference),
        tags: ["zap"],
        source: "zap-baseline",
        discovered_at: new Date().toISOString(),
      });
    }
  }
  return out;
}

// ── nikto ───────────────────────────────────────────────────────────────────
function parseNikto(path: string): Finding[] {
  const raw = readFileSync(path, "utf8");
  let data: { vulnerabilities?: Array<Record<string, unknown>> };
  try { data = JSON.parse(raw); } catch { return []; }
  return (data.vulnerabilities ?? []).map((v) => ({
    id: `NIKTO-${(v.id as string) ?? "unknown"}-${sha8(String(v.url ?? "") + String(v.msg ?? ""))}`,
    title: `Nikto: ${v.msg ?? v.id}`,
    severity: "low" as const,
    category: "headers",
    stack_area: "app-middleware",
    location: { url: v.url as string, method: v.method as string },
    evidence: { snippet: `${v.msg ?? ""}\nReferences: ${v.references ?? ""}` },
    tags: ["nikto"],
    source: "nikto",
    discovered_at: new Date().toISOString(),
  }));
}

// ── helpers ─────────────────────────────────────────────────────────────────
type Severity = Finding["severity"];
function normalizeSeverity(raw: string): Severity {
  const s = (raw ?? "").toLowerCase();
  if (/critical/.test(s)) return "critical";
  if (/high/.test(s)) return "high";
  if (/medium|moderate|warning/.test(s)) return "medium";
  if (/low/.test(s)) return "low";
  return "info";
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function sha8(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 8);
}

function inferStackArea(url: string): string {
  if (/:3001\b|\/api\//.test(url)) return "api-route";
  if (/:3002\b|\/admin\b|\/zadmin\b/.test(url)) return "app-middleware";
  if (/:3000\b/.test(url)) return "app-middleware";
  return "other";
}

function mapCategoryFromTags(tags: string[] | string | undefined): string {
  const arr = toArray(tags).map(String).map((t) => t.toLowerCase());
  if (arr.some((t) => /xss/.test(t))) return "injection";
  if (arr.some((t) => /sqli/.test(t))) return "injection";
  if (arr.some((t) => /ssrf/.test(t))) return "api";
  if (arr.some((t) => /rce/.test(t))) return "injection";
  if (arr.some((t) => /cve/.test(t))) return "deps";
  if (arr.some((t) => /misconfig|exposure/.test(t))) return "headers";
  if (arr.some((t) => /tls|ssl/.test(t))) return "tls";
  if (arr.some((t) => /token|secret/.test(t))) return "secrets";
  if (arr.some((t) => /auth/.test(t))) return "auth";
  return "other";
}
