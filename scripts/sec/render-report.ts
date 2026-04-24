#!/usr/bin/env -S npx tsx
/**
 * render-report.ts — Pentest Report Renderer
 *
 * Reads a normalized findings JSON and renders an HTML report using the
 * template at docs/security/report-template.html.
 *
 * Security properties:
 *   1. Single sanitization boundary — every user-controlled string is
 *      escaped HERE, exactly once, via escapeHtml(). Template placeholders
 *      receive already-escaped strings. No double-escape, no re-insertion.
 *   2. No eval, no Function, no template engine — plain string replace.
 *   3. No network. No external resources. No filesystem access outside
 *      the explicit input / output paths.
 *   4. Secrets in evidence fields are NEVER emitted verbatim. Anything
 *      matching the secret regexes is replaced with a SHA-256 fingerprint.
 *
 * Usage:
 *   npx tsx scripts/sec/render-report.ts <findings.json> <output.html>
 *         [--baseline=.claude/security/baselines/<host>.json]
 *         [--save-baseline]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low" | "info";
type Status = "new" | "unchanged" | "regressed" | "fixed";

interface Finding {
  id: string;
  title: string;
  severity: Severity;
  cvss?: { vector: string; score: number };
  cwe?: string[];
  asvs?: string[];
  owasp?: string[];
  category?: string;
  location?: {
    file?: string;
    line?: number;
    url?: string;
    method?: string;
  };
  evidence?: { request?: string; response?: string; snippet?: string };
  repro?: string;
  fix?: { summary?: string; diff?: string };
  tags?: string[];
  baseline_status?: Status;
  discovered_at?: string;
  references?: string[];
  stack_area?: string;
  source?: string;
}

interface Report {
  host: string;
  scope: string;
  date: string; // ISO
  duration_ms: number;
  tools: string[];
  user_agent: string;
  rate_limit_rps: number;
  findings: Finding[];
  report_id?: string;
}

// ── Safety utilities ───────────────────────────────────────────────────────

/** HTML-escape. Prevents HTML/JS injection from finding content into report. */
function escapeHtml(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Redact anything that looks like a live secret in evidence strings.
 *  Run before escapeHtml; they are additive, not alternatives. */
const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{20,}/g,                // Anthropic
  /sk-[A-Za-z0-9]{20,}/g,                       // OpenAI-style
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,              // Slack
  /AIza[0-9A-Za-z_-]{35}/g,                     // Google API
  /AKIA[0-9A-Z]{16}/g,                          // AWS access key
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END[^-]+-----/g,
  /SUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*[^\s"'`]+/gi,
  /INTERNAL_API_KEY\s*[=:]\s*[^\s"'`]+/gi,
  /ENCRYPTION_SECRET\s*[=:]\s*[^\s"'`]+/gi,
  /[Aa]uthorization:\s*Bearer\s+[A-Za-z0-9._-]{20,}/g,
  /password\s*[=:]\s*['"][^'"]{6,}['"]/gi,
];

function redactSecrets(s: string): string {
  let out = s;
  for (const pat of SECRET_PATTERNS) {
    out = out.replaceAll(pat, (match) => {
      const fp = createHash("sha256").update(match).digest("hex").slice(0, 8);
      return `<REDACTED:sha256:${fp}>`;
    });
  }
  return out;
}

/** Combined: redact → escape. Safe for insertion into the template. */
function safe(s: unknown): string {
  if (s == null) return "";
  return escapeHtml(redactSecrets(String(s)));
}

// ── Donut SVG segments (dependency-free) ──────────────────────────────────

const SEV_COLOR: Record<Severity, string> = {
  critical: "var(--crit)",
  high: "var(--high)",
  medium: "var(--med)",
  low: "var(--low)",
  info: "var(--info)",
};

function donutSegments(counts: Record<Severity, number>): string {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return `<circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--bg-3)" stroke-width="5"></circle>`;
  }
  const order: Severity[] = ["critical", "high", "medium", "low", "info"];
  const circumference = 2 * Math.PI * 15.915; // ≈ 100
  let offset = 25; // start at top
  const segs: string[] = [];
  for (const sev of order) {
    const n = counts[sev];
    if (n === 0) continue;
    const len = (n / total) * circumference;
    const gap = circumference - len;
    segs.push(
      `<circle cx="21" cy="21" r="15.915" fill="none" stroke="${SEV_COLOR[sev]}" stroke-width="5" stroke-dasharray="${len.toFixed(3)} ${gap.toFixed(3)}" stroke-dashoffset="${offset.toFixed(3)}" transform="rotate(-90 21 21)"></circle>`,
    );
    offset -= len;
  }
  return segs.join("\n");
}

// ── Baseline diff ──────────────────────────────────────────────────────────

function annotateWithBaseline(
  current: Finding[],
  baselinePath: string | undefined,
): Finding[] {
  if (!baselinePath || !existsSync(baselinePath)) {
    return current.map((f) => ({ ...f, baseline_status: f.baseline_status ?? "new" }));
  }
  const baseline: Report = JSON.parse(readFileSync(baselinePath, "utf8"));
  const baseIds = new Set(baseline.findings.map((f) => f.id));
  const currentIds = new Set(current.map((f) => f.id));
  const annotated: Finding[] = current.map((f) => {
    if (!baseIds.has(f.id)) return { ...f, baseline_status: "new" };
    const prev = baseline.findings.find((b) => b.id === f.id);
    if (prev && sevRank(prev.severity) < sevRank(f.severity)) {
      return { ...f, baseline_status: "regressed" };
    }
    return { ...f, baseline_status: "unchanged" };
  });
  // Surface fixed findings as informational rows so the report shows the
  // delta, not just the current state.
  for (const prev of baseline.findings) {
    if (!currentIds.has(prev.id)) {
      annotated.push({ ...prev, baseline_status: "fixed", severity: "info" });
    }
  }
  return annotated;
}

function sevRank(s: Severity): number {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[s];
}

// ── Finding HTML ───────────────────────────────────────────────────────────

const SEV_SHORT: Record<Severity, string> = {
  critical: "crit",
  high: "high",
  medium: "med",
  low: "low",
  info: "info",
};

function renderFinding(f: Finding): string {
  const sev = SEV_SHORT[f.severity];
  const status = f.baseline_status ?? "new";
  const source = f.source ?? "unknown";
  const searchBlob = [
    f.id,
    f.title,
    f.category,
    f.stack_area,
    f.source,
    ...(f.cwe ?? []),
    ...(f.owasp ?? []),
    ...(f.tags ?? []),
    f.location?.file,
    f.location?.url,
  ]
    .filter(Boolean)
    .join(" ");

  const statusPill =
    status === "new" || status === "regressed" || status === "fixed"
      ? `<span class="meta-pill status-${status}">${status.toUpperCase()}</span>`
      : "";

  const locLine = f.location
    ? f.location.file
      ? `${safe(f.location.file)}${f.location.line ? `:${f.location.line}` : ""}`
      : f.location.url
        ? `<code>${safe(f.location.method ?? "GET")}</code> ${safe(f.location.url)}`
        : ""
    : "";

  const refsKv = (k: string, v: string | undefined) =>
    v ? `<div class="kv"><div class="k">${safe(k)}</div><div>${v}</div></div>` : "";

  const cwe = (f.cwe ?? [])
    .map(
      (c) =>
        `<a href="https://cwe.mitre.org/data/definitions/${safe(c.replace(/^CWE-/, ""))}.html" target="_blank" rel="noreferrer noopener">${safe(c)}</a>`,
    )
    .join(", ");

  const tagsHtml = (f.tags ?? [])
    .map((t) => `<span class="tag">${safe(t)}</span>`)
    .join("");

  const evidenceBlocks: string[] = [];
  if (f.evidence?.request)
    evidenceBlocks.push(`<pre><code>${safe(f.evidence.request)}</code></pre>`);
  if (f.evidence?.response)
    evidenceBlocks.push(`<pre><code>${safe(f.evidence.response)}</code></pre>`);
  if (f.evidence?.snippet)
    evidenceBlocks.push(`<pre><code>${safe(f.evidence.snippet)}</code></pre>`);

  const reproBlock = f.repro
    ? `<div class="section"><h4>Reproduce</h4><pre><code>${safe(f.repro)}</code></pre></div>`
    : "";

  const fixBlock = f.fix
    ? `<div class="section">
         <h4>Proposed fix</h4>
         ${f.fix.summary ? `<p>${safe(f.fix.summary)}</p>` : ""}
         ${f.fix.diff ? `<pre><code>${safe(f.fix.diff)}</code></pre>` : ""}
       </div>`
    : "";

  const evidenceSection = evidenceBlocks.length
    ? `<div class="section"><h4>Evidence</h4>${evidenceBlocks.join("")}</div>`
    : "";

  const refs = `
    ${refsKv("Severity", `<b>${f.severity.toUpperCase()}</b>`)}
    ${refsKv("Source", safe(f.source))}
    ${refsKv("Category", safe(f.category))}
    ${refsKv("Stack area", safe(f.stack_area))}
    ${refsKv("CWE", cwe)}
    ${refsKv("OWASP", (f.owasp ?? []).map(safe).join(", "))}
    ${refsKv("ASVS", (f.asvs ?? []).map(safe).join(", "))}
    ${refsKv("CVSS", f.cvss ? `<b>${f.cvss.score.toFixed(1)}</b> <span class="cvss">${safe(f.cvss.vector)}</span>` : "")}
    ${refsKv("Location", locLine)}
    ${refsKv("Discovered", safe(f.discovered_at))}
  `;

  return `
<details class="f" data-sev="${sev}" data-status="${safe(status)}" data-source="${safe(source)}" data-search="${safe(searchBlob)}">
  <summary>
    <span class="sev-dot ${sev}"></span>
    <span class="sev-tag ${sev}">${f.severity}</span>
    <span class="title"><span class="id">${safe(f.id)}</span>${safe(f.title)}</span>
    ${statusPill}
    <span class="meta-pill source">${safe(source)}</span>
    <span class="meta-pill">${f.cvss ? f.cvss.score.toFixed(1) : "—"}</span>
  </summary>
  <div class="body">
    <div>
      ${evidenceSection}
      ${reproBlock}
      ${fixBlock}
    </div>
    <div>
      <div class="section">
        <h4>Details</h4>
        <div class="refs">${refs}</div>
      </div>
      ${tagsHtml ? `<div class="section"><h4>Tags</h4><div class="tags">${tagsHtml}</div></div>` : ""}
    </div>
  </div>
</details>`;
}

// ── Diff pills ─────────────────────────────────────────────────────────────

function diffPills(findings: Finding[]): string {
  const counts = { new: 0, regressed: 0, fixed: 0 };
  for (const f of findings) {
    const s = f.baseline_status;
    if (s === "new" || s === "regressed" || s === "fixed") counts[s]++;
  }
  const items: string[] = [];
  if (counts.new) items.push(`<span class="diff-pill new"><b>${counts.new}</b> new</span>`);
  if (counts.regressed)
    items.push(`<span class="diff-pill regressed"><b>${counts.regressed}</b> regressed</span>`);
  if (counts.fixed)
    items.push(`<span class="diff-pill fixed"><b>${counts.fixed}</b> fixed</span>`);
  if (!items.length) items.push(`<span class="diff-pill">no baseline comparison</span>`);
  return items.join("");
}

/** Group findings by source and produce pills + filter chips.
 *  Returns [pillsHtml, chipsHtml]. */
function sourceControls(findings: Finding[]): { pills: string; chips: string } {
  const bySource = new Map<string, number>();
  for (const f of findings) {
    const s = f.source ?? "unknown";
    bySource.set(s, (bySource.get(s) ?? 0) + 1);
  }
  // Stable sort: most findings first, then name.
  const entries = [...bySource.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  if (entries.length === 0) {
    return {
      pills: `<span class="source-pill">no sources</span>`,
      chips: "",
    };
  }
  const pills = entries
    .map(([src, n]) => `<span class="source-pill ${safe(sourceClass(src))}"><b>${n}</b> ${safe(src)}</span>`)
    .join("");
  const chips =
    `<button class="chip" data-source="all" aria-pressed="true">All sources · ${findings.length}</button>` +
    entries
      .map(
        ([src, n]) =>
          `<button class="chip" data-source="${safe(src)}" aria-pressed="false">${safe(src)} · ${n}</button>`,
      )
      .join("");
  return { pills, chips };
}

function sourceClass(src: string): string {
  // Maps to CSS classes defined in the template.
  if (src.startsWith("playwright")) return "playwright";
  if (src === "nuclei") return "nuclei";
  if (src === "zap-baseline") return "zap-baseline";
  if (src === "gitleaks") return "gitleaks";
  if (src === "trufflehog") return "trufflehog";
  if (src === "nikto") return "nikto";
  return "";
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.error("Usage: render-report.ts <findings.json> <output.html> [--baseline=path] [--save-baseline]");
    process.exit(2);
  }
  const [findingsPath, outputPath, ...flags] = argv;
  const baselineFlag = flags.find((f) => f.startsWith("--baseline="));
  const baselinePath = baselineFlag ? baselineFlag.split("=", 2)[1] : undefined;
  const saveBaseline = flags.includes("--save-baseline");

  const report: Report = JSON.parse(readFileSync(resolve(findingsPath), "utf8"));

  // Annotate findings with baseline status.
  report.findings = annotateWithBaseline(report.findings, baselinePath);

  // Count severities (fixed items count as "info" visually).
  const counts: Record<Severity, number> = {
    critical: 0, high: 0, medium: 0, low: 0, info: 0,
  };
  for (const f of report.findings) counts[f.severity]++;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // Sort: severity desc, then status (new/regressed first), then id.
  const statusRank: Record<Status, number> = { regressed: 0, new: 1, unchanged: 2, fixed: 3 };
  report.findings.sort((a, b) => {
    const sa = sevRank(b.severity) - sevRank(a.severity);
    if (sa !== 0) return sa;
    const sb = statusRank[a.baseline_status ?? "new"] - statusRank[b.baseline_status ?? "new"];
    if (sb !== 0) return sb;
    return a.id.localeCompare(b.id);
  });

  const reportId =
    report.report_id ??
    createHash("sha256")
      .update(`${report.host}|${report.date}|${report.findings.length}`)
      .digest("hex")
      .slice(0, 12);

  const templatePath = resolve(
    process.cwd(),
    "docs/security/report-template.html",
  );
  const tpl = readFileSync(templatePath, "utf8");

  const findingsHtml = report.findings.length
    ? report.findings.map(renderFinding).join("\n")
    : `<div class="empty"><div class="ico">✓</div><div>No findings.</div></div>`;

  const rendered = tpl
    .replaceAll("{{__HOST__}}", safe(report.host))
    .replaceAll("{{__SCOPE__}}", safe(report.scope))
    .replaceAll("{{__DATE__}}", safe(report.date))
    .replaceAll("{{__DURATION__}}", safe(formatDuration(report.duration_ms)))
    .replaceAll("{{__TOOLS__}}", safe((report.tools ?? []).join(", ")))
    .replaceAll("{{__UA__}}", safe(report.user_agent))
    .replaceAll("{{__RATE__}}", safe(report.rate_limit_rps))
    .replaceAll("{{__REPORT_ID__}}", safe(reportId))
    .replaceAll("{{__COUNT_CRIT__}}", String(counts.critical))
    .replaceAll("{{__COUNT_HIGH__}}", String(counts.high))
    .replaceAll("{{__COUNT_MED__}}", String(counts.medium))
    .replaceAll("{{__COUNT_LOW__}}", String(counts.low))
    .replaceAll("{{__COUNT_INFO__}}", String(counts.info))
    .replaceAll("{{__COUNT_TOTAL__}}", String(total))
    .replaceAll("{{__DONUT_SEGMENTS__}}", donutSegments(counts))
    .replaceAll("{{__DIFF_PILLS__}}", diffPills(report.findings))
    .replaceAll("{{__SOURCE_PILLS__}}", sourceControls(report.findings).pills)
    .replaceAll("{{__SOURCE_CHIPS__}}", sourceControls(report.findings).chips)
    .replaceAll("{{__FINDINGS_HTML__}}", findingsHtml);

  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(resolve(outputPath), rendered, { mode: 0o644 });
  console.log(`✓ report written: ${outputPath}`);
  console.log(`  findings: crit=${counts.critical} high=${counts.high} med=${counts.medium} low=${counts.low} info=${counts.info}`);

  if (saveBaseline) {
    const baseOut =
      baselinePath ?? `.claude/security/baselines/${safeHostForPath(report.host)}.json`;
    mkdirSync(dirname(resolve(baseOut)), { recursive: true });
    // Strip fixed items from baseline (they don't belong there).
    const baselineFindings = report.findings.filter(
      (f) => f.baseline_status !== "fixed",
    );
    writeFileSync(
      resolve(baseOut),
      JSON.stringify({ ...report, findings: baselineFindings }, null, 2),
      { mode: 0o644 },
    );
    console.log(`✓ baseline saved: ${baseOut}`);
  }
}

function safeHostForPath(host: string): string {
  return host.replaceAll(/[^a-z0-9.-]/gi, "_");
}

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

main();
