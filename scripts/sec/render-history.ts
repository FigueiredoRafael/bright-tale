#!/usr/bin/env -S npx tsx
/**
 * render-history.ts — builds reports/history.html
 *
 * Scans the history directory (and the current reports dir) for pentest runs,
 * loads their findings JSON, and emits a single timeline dashboard showing
 * every run the project has recorded, sorted newest first.
 *
 * Usage:
 *   npx tsx scripts/sec/render-history.ts
 *   npx tsx scripts/sec/render-history.ts --history=reports/history --output=reports/history.html
 *
 * The output is a standalone self-contained HTML file — no external deps,
 * same CSP posture as the per-run report. Users open it as file:// or via
 * any static host.
 */

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { resolve, basename, relative, dirname } from "node:path";
import { createHash } from "node:crypto";

type Severity = "critical" | "high" | "medium" | "low" | "info";

interface RunMeta {
  /** Path to the HTML (relative to the dashboard file). */
  htmlPath: string;
  /** Path to the JSON (absolute, used only to read). */
  jsonPath: string;
  /** Sequential label ("001", "002", ...) or the timestamped filename base. */
  label: string;
  /** Human-readable slug next to the label, e.g. "after-crown-jewel-fix". */
  slug?: string;
  /** ISO date from the JSON. */
  date: string;
  /** Host / target. */
  host: string;
  /** Total findings. */
  total: number;
  counts: Record<Severity, number>;
  bySource: Record<string, number>;
  /** SHA-8 of the findings content for dedupe. */
  hash: string;
}

function escapeHtml(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseArgs() {
  const out = {
    historyDirs: ["reports/history"],
    current: "reports",
    output: "reports/history.html",
  };
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--(history|output|current)=(.+)$/);
    if (m) {
      if (m[1] === "history") out.historyDirs = m[2].split(",");
      else if (m[1] === "current") out.current = m[2];
      else if (m[1] === "output") out.output = m[2];
    }
  }
  return out;
}

function discover(dirs: string[], outputFile: string): RunMeta[] {
  const runs: RunMeta[] = [];
  const seen = new Set<string>();
  const outputDir = dirname(resolve(outputFile));

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const jsonPath = resolve(dir, file);
      const html = file.replace(/\.json$/, ".html");
      const htmlAbsPath = resolve(dir, html);
      if (!existsSync(htmlAbsPath)) continue;
      let data: {
        host?: string;
        date?: string;
        findings?: Array<{ severity: Severity; source?: string }>;
      };
      try {
        data = JSON.parse(readFileSync(jsonPath, "utf8"));
      } catch {
        continue;
      }
      const findings = data.findings ?? [];
      const counts: Record<Severity, number> = {
        critical: 0, high: 0, medium: 0, low: 0, info: 0,
      };
      const bySource: Record<string, number> = {};
      for (const f of findings) {
        counts[f.severity]++;
        const src = f.source ?? "unknown";
        bySource[src] = (bySource[src] ?? 0) + 1;
      }
      const hash = createHash("sha256").update(JSON.stringify(findings)).digest("hex").slice(0, 8);
      if (seen.has(hash)) continue;
      seen.add(hash);

      // Extract label + slug from filename: "003-after-crown-jewel-fix.html"
      // or fallback to the full basename.
      const base = basename(file, ".json");
      const m = base.match(/^(\d{3})-(.*)$/);
      const label = m?.[1] ?? base;
      const slug = m?.[2];

      runs.push({
        // Relative to the dashboard's output dir so the <a href> resolves in
        // the browser regardless of where the file is opened from.
        htmlPath: relative(outputDir, htmlAbsPath),
        jsonPath,
        label,
        slug,
        date: data.date ?? statSync(jsonPath).mtime.toISOString(),
        host: data.host ?? "unknown",
        total: findings.length,
        counts,
        bySource,
        hash,
      });
    }
  }
  runs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return runs;
}

function deltaCell(current: number, prev: number | undefined, severity: Severity): string {
  if (prev === undefined || current === prev) return "";
  const delta = current - prev;
  const sign = delta > 0 ? "+" : "";
  const cls = delta > 0 ? "up" : "down";
  // "up" is bad for severity counts — color red; "down" is good — color green.
  return `<span class="delta ${cls}">${sign}${delta}</span>`;
}

function renderRow(run: RunMeta, prev?: RunMeta): string {
  const severities: Severity[] = ["critical", "high", "medium", "low", "info"];
  const sevCells = severities
    .map((s) => {
      const n = run.counts[s];
      const d = prev ? deltaCell(n, prev.counts[s], s) : "";
      return `<td class="sev sev-${s}"><span class="n">${n}</span>${d}</td>`;
    })
    .join("");
  const sources = Object.entries(run.bySource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([s, n]) => `<span class="source">${escapeHtml(s)} · ${n}</span>`)
    .join(" ");
  const slug = run.slug ? escapeHtml(run.slug.replace(/[_-]/g, " ")) : escapeHtml(run.host);
  return `
  <tr class="run" onclick="window.location.href='${escapeHtml(run.htmlPath)}'">
    <td class="label"><span class="num">${escapeHtml(run.label)}</span></td>
    <td class="when">
      <div class="date">${escapeHtml(run.date.slice(0, 10))}</div>
      <div class="time">${escapeHtml(run.date.slice(11, 16))} UTC</div>
    </td>
    <td class="slug">
      <div class="slug-main">${slug}</div>
      <div class="slug-host">${escapeHtml(run.host)}</div>
    </td>
    ${sevCells}
    <td class="total">${run.total}</td>
    <td class="sources">${sources}</td>
    <td class="open"><a href="${escapeHtml(run.htmlPath)}">open →</a></td>
  </tr>`;
}

function render(runs: RunMeta[]): string {
  const latest = runs[0];
  const rows = runs
    .map((r, i) => renderRow(r, runs[i + 1]))
    .join("");

  // Build a compact trend table for the tile: last N runs' critical/high counts.
  const last = runs.slice(0, 10).reverse();
  const trend = last
    .map(
      (r) =>
        `<div class="bar" title="${escapeHtml(r.label)} · crit ${r.counts.critical} · high ${r.counts.high}">` +
        `<div class="seg crit" style="height:${r.counts.critical * 6}px"></div>` +
        `<div class="seg high" style="height:${r.counts.high * 4}px"></div>` +
        `<div class="seg med"  style="height:${r.counts.medium * 2}px"></div>` +
        `<div class="seg low"  style="height:${r.counts.low * 1.2}px"></div>` +
        `</div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'self'">
<title>BrightSec · Pentest History</title>
<style>
  :root {
    --bg:#0a0e1a; --bg-2:#121826; --bg-3:#1a2235; --line:#263146;
    --fg:#e6edf7; --fg-dim:#8b98b0; --fg-faint:#5e6b83;
    --crit:#ff4d6d; --high:#ff9149; --med:#ffd34d; --low:#4dd0ff; --info:#8892a6;
    --up:#ff4d6d; --down:#4ade80;
    --accent:#8b5cf6; --accent-2:#22d3ee;
    --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
  }
  * { box-sizing:border-box; }
  html,body { margin:0; padding:0; background:var(--bg); color:var(--fg); font-family:var(--sans); font-size:14px; line-height:1.5; }
  a { color:var(--accent-2); text-decoration:none; }
  a:hover { text-decoration:underline; }
  .wrap { max-width:1320px; margin:0 auto; padding:28px 32px 64px; }

  header.hd { display:flex; justify-content:space-between; align-items:baseline; padding-bottom:20px; border-bottom:1px solid var(--line); }
  header.hd h1 { font-size:22px; font-weight:700; margin:0; letter-spacing:-0.01em; }
  header.hd h1 .brand { color:var(--accent); }
  header.hd .sub { color:var(--fg-dim); font-size:12.5px; }

  .kpis { display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; margin:24px 0; }
  .tile { background:var(--bg-2); border:1px solid var(--line); border-radius:12px; padding:18px; }
  .tile h3 { font-size:11px; text-transform:uppercase; letter-spacing:0.12em; color:var(--fg-dim); margin:0 0 8px; font-weight:600; }
  .tile .big { font-size:28px; font-weight:700; letter-spacing:-0.02em; }
  .tile .sub { font-size:12px; color:var(--fg-dim); margin-top:2px; }
  .tile .trend { display:flex; align-items:flex-end; gap:3px; height:60px; margin-top:6px; }
  .bar { flex:1; display:flex; flex-direction:column-reverse; gap:1px; min-width:4px; }
  .seg { border-radius:2px 2px 0 0; }
  .seg.crit { background:var(--crit); }
  .seg.high { background:var(--high); }
  .seg.med  { background:var(--med); }
  .seg.low  { background:var(--low); }

  .toolbar { display:flex; gap:10px; margin:14px 0; align-items:center; flex-wrap:wrap; }
  .search { flex:1; min-width:240px; background:var(--bg-2); border:1px solid var(--line); color:var(--fg); padding:8px 12px; border-radius:8px; font-family:var(--mono); font-size:12.5px; }
  .search:focus { outline:none; border-color:var(--accent); }
  .count { color:var(--fg-dim); font-size:12px; }
  /* run button + log viewer */
  .run-btn { background:linear-gradient(135deg, var(--accent), var(--accent-2)); color:#fff; border:none; font-weight:600; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px; display:inline-flex; align-items:center; gap:8px; transition:opacity 0.12s, transform 0.08s; }
  .run-btn:hover { opacity:0.92; }
  .run-btn:active { transform:translateY(1px); }
  .run-btn:disabled { opacity:0.6; cursor:wait; }
  .scanner-toggle { display:flex; align-items:center; gap:6px; color:var(--fg-dim); font-size:11.5px; user-select:none; cursor:pointer; padding:4px 10px; border:1px solid var(--line); border-radius:6px; background:var(--bg-2); }
  .scanner-toggle input { accent-color:var(--accent); margin:0; }
  .scanner-toggle:hover { color:var(--fg); }
  .dot-pulse { width:8px; height:8px; border-radius:50%; background:#fff; animation:pulse 1.1s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:0.35} 50%{opacity:1} }

  .run-panel { margin:14px 0; background:var(--bg-2); border:1px solid var(--line); border-radius:12px; overflow:hidden; display:none; }
  .run-panel.open { display:block; }
  .run-panel-header { padding:12px 16px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; background:var(--bg-3); }
  .run-panel-header h3 { font-size:11px; text-transform:uppercase; letter-spacing:0.12em; color:var(--fg-dim); margin:0; font-weight:600; }
  .run-panel-header .status { font-family:var(--mono); font-size:11px; color:var(--fg-dim); display:flex; align-items:center; gap:8px; }
  .run-panel-header .status .badge { padding:2px 8px; border-radius:999px; font-size:10.5px; font-weight:600; }
  .run-panel-header .status .badge.running { background:color-mix(in srgb, var(--accent) 22%, transparent); color:var(--accent); }
  .run-panel-header .status .badge.ok { background:color-mix(in srgb, var(--down) 22%, transparent); color:var(--down); }
  .run-panel-header .status .badge.err { background:color-mix(in srgb, var(--up) 22%, transparent); color:var(--up); }
  .run-log { font-family:var(--mono); font-size:11.5px; color:#dbe4f5; padding:12px 16px; max-height:320px; overflow:auto; white-space:pre-wrap; line-height:1.6; background:#05070d; }
  .run-log .line-stderr { color:var(--high); }
  .run-log .line-stdout { color:#dbe4f5; }
  .run-panel .actions { padding:10px 16px; display:flex; gap:10px; border-top:1px solid var(--line); background:var(--bg-3); }
  .run-panel .actions a { font-size:12px; color:var(--accent-2); font-family:var(--mono); }
  .server-offline { padding:8px 14px; background:var(--bg-2); border:1px dashed var(--line); border-radius:8px; color:var(--fg-dim); font-size:11.5px; }

  /* big offline banner shown when the page is opened via file:// */
  .offline-banner { margin:18px 0 0; padding:18px 22px; border-radius:12px; background:linear-gradient(135deg, color-mix(in srgb, var(--high) 18%, var(--bg-2)), color-mix(in srgb, var(--accent) 10%, var(--bg-2))); border:1px solid color-mix(in srgb, var(--high) 40%, var(--line)); display:flex; gap:18px; align-items:flex-start; }
  /* HTML hidden attribute is overridden by display:flex above — force it back. */
  .offline-banner[hidden] { display:none !important; }
  .offline-banner .icon { font-size:22px; line-height:1; color:var(--high); }
  .offline-banner h2 { margin:0 0 6px; font-size:14px; font-weight:600; color:var(--fg); }
  .offline-banner p { margin:0 0 10px; font-size:12.5px; color:var(--fg-dim); line-height:1.55; }
  .offline-banner pre { margin:0; padding:10px 14px; background:#05070d; border:1px solid var(--line); border-radius:8px; color:#dbe4f5; font-family:var(--mono); font-size:12px; overflow:auto; }
  .offline-banner a { color:var(--accent-2); }

  /* scanner tool list inside the legend */
  .scanner-list { display:grid; grid-template-columns:auto 1fr auto; gap:6px 14px; font-size:12px; margin-top:6px; }
  .scanner-list .tool { color:var(--fg); font-family:var(--mono); font-size:11.5px; font-weight:600; }
  .scanner-list .purpose { color:var(--fg-dim); }
  .scanner-list .time { color:var(--fg-faint); font-family:var(--mono); font-size:11px; text-align:right; }

  table.runs { width:100%; border-collapse:separate; border-spacing:0; background:var(--bg-2); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  table.runs th { text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:0.1em; color:var(--fg-dim); padding:14px 12px; border-bottom:1px solid var(--line); font-weight:600; background:var(--bg-3); }
  table.runs td { padding:12px 12px; border-bottom:1px solid var(--line); vertical-align:middle; }
  table.runs tr:last-child td { border-bottom:none; }
  tr.run { cursor:pointer; transition:background 0.12s; }
  tr.run:hover { background:var(--bg-3); }

  .label .num { font-family:var(--mono); font-size:13px; color:var(--accent); font-weight:600; }
  .when .date { font-family:var(--mono); font-size:12.5px; color:var(--fg); }
  .when .time { font-family:var(--mono); font-size:11px; color:var(--fg-faint); margin-top:2px; }
  .slug .slug-main { color:var(--fg); font-weight:500; text-transform:capitalize; }
  .slug .slug-host { font-family:var(--mono); font-size:11px; color:var(--fg-faint); margin-top:2px; }

  td.sev { text-align:center; font-family:var(--mono); width:70px; position:relative; }
  td.sev .n { font-size:14px; font-weight:600; }
  td.sev.sev-critical .n { color:var(--crit); }
  td.sev.sev-high     .n { color:var(--high); }
  td.sev.sev-medium   .n { color:var(--med); }
  td.sev.sev-low      .n { color:var(--low); }
  td.sev.sev-info     .n { color:var(--info); }
  td.sev .n:empty, td.sev .n[data-zero="1"] { color:var(--fg-faint); }
  .delta { position:absolute; top:6px; right:8px; font-size:9.5px; padding:1px 5px; border-radius:4px; font-weight:600; }
  .delta.up   { background:color-mix(in srgb, var(--up) 18%, transparent); color:var(--up); }
  .delta.down { background:color-mix(in srgb, var(--down) 18%, transparent); color:var(--down); }

  td.total { font-family:var(--mono); font-size:14px; font-weight:700; color:var(--fg); text-align:right; padding-right:20px; }
  td.sources { font-size:11px; color:var(--fg-dim); }
  .source { display:inline-block; margin-right:8px; padding:2px 6px; border-radius:4px; background:var(--bg-3); border:1px solid var(--line); font-family:var(--mono); color:var(--fg-dim); }
  td.open { text-align:right; }
  td.open a { font-family:var(--mono); font-size:11.5px; color:var(--accent-2); }

  .empty { text-align:center; color:var(--fg-dim); padding:80px 20px; }
  footer { margin-top:32px; padding-top:18px; border-top:1px solid var(--line); color:var(--fg-faint); font-size:11.5px; }

  /* legend */
  details.legend { margin:18px 0; background:var(--bg-2); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  details.legend[open] { border-color:color-mix(in srgb, var(--accent) 30%, var(--line)); }
  details.legend summary { cursor:pointer; list-style:none; padding:14px 18px; display:flex; justify-content:space-between; align-items:center; user-select:none; }
  details.legend summary::-webkit-details-marker { display:none; }
  details.legend summary h3 { margin:0; font-size:12px; text-transform:uppercase; letter-spacing:0.12em; color:var(--fg-dim); font-weight:600; }
  details.legend summary .hint { font-size:11.5px; color:var(--fg-faint); }
  details.legend summary .arr { display:inline-block; transition:transform 0.15s; color:var(--fg-dim); margin-left:10px; }
  details.legend[open] summary .arr { transform:rotate(90deg); }
  details.legend .body { padding:0 18px 18px; border-top:1px solid var(--line); padding-top:18px; display:grid; grid-template-columns:repeat(2, 1fr); gap:22px; }
  details.legend .body h4 { font-size:11px; text-transform:uppercase; letter-spacing:0.12em; color:var(--fg-dim); margin:0 0 10px; font-weight:600; }
  details.legend .body p { margin:0 0 8px; color:var(--fg-dim); font-size:12.5px; line-height:1.55; }
  details.legend .body table { width:100%; border-collapse:collapse; font-size:12px; }
  details.legend .body td { padding:6px 8px; vertical-align:top; color:var(--fg); border-bottom:1px solid var(--line); }
  details.legend .body td:first-child { width:1%; white-space:nowrap; }
  details.legend .body tr:last-child td { border-bottom:none; }
  details.legend .pill { display:inline-block; padding:2px 8px; border-radius:6px; font-family:var(--mono); font-size:11px; border:1px solid var(--line); background:var(--bg-3); color:var(--fg-dim); }
  details.legend .pill.crit { color:var(--crit); border-color:color-mix(in srgb, var(--crit) 40%, var(--line)); }
  details.legend .pill.high { color:var(--high); border-color:color-mix(in srgb, var(--high) 40%, var(--line)); }
  details.legend .pill.med  { color:var(--med);  border-color:color-mix(in srgb, var(--med)  40%, var(--line)); }
  details.legend .pill.low  { color:var(--low);  border-color:color-mix(in srgb, var(--low)  40%, var(--line)); }
  details.legend .pill.info { color:var(--info); border-color:color-mix(in srgb, var(--info) 40%, var(--line)); }
  details.legend .pill.up   { color:var(--up);   border-color:color-mix(in srgb, var(--up)   40%, var(--line)); }
  details.legend .pill.down { color:var(--down); border-color:color-mix(in srgb, var(--down) 40%, var(--line)); }
  details.legend .pill.pw   { color:var(--accent);   border-color:color-mix(in srgb, var(--accent)   40%, var(--line)); }
  details.legend .pill.nu   { color:var(--high);     border-color:color-mix(in srgb, var(--high)     40%, var(--line)); }
  details.legend .pill.sec  { color:var(--crit);     border-color:color-mix(in srgb, var(--crit)     40%, var(--line)); }
  details.legend .body .spanfull { grid-column:1 / -1; padding-top:8px; border-top:1px solid var(--line); margin-top:4px; color:var(--fg-faint); font-size:11.5px; }
</style>
</head>
<body>
<main class="wrap">
  <header class="hd">
    <div>
      <h1><span class="brand">BrightSec</span> · Pentest History</h1>
      <div class="sub">All runs recorded for this project · newest first</div>
    </div>
    <div class="sub">Generated ${escapeHtml(new Date().toISOString().slice(0, 16))} UTC · ${runs.length} run${runs.length === 1 ? "" : "s"}</div>
  </header>

  <aside class="offline-banner" id="offlineBanner" hidden>
    <div class="icon">⚠</div>
    <div style="flex:1">
      <h2>This page is opened as <code>file://</code> — the <b>Run pentest</b> button needs the local server</h2>
      <p>Start the server in a terminal, then reopen via HTTP:</p>
      <pre>npx tsx scripts/sec/server.ts
<span style="color:var(--fg-faint)"># then open</span>
open http://127.0.0.1:3030/history.html</pre>
      <p style="margin-top:10px">Static viewing still works here — the table and all per-run reports are clickable. Only the "Run pentest" trigger needs the server.</p>
    </div>
  </aside>

  ${runs.length === 0 ? `
  <div class="empty">No runs recorded yet. Run <code>npx tsx scripts/sec/playwright/pentest.ts</code>.</div>
  ` : `
  <section class="kpis">
    <div class="tile">
      <h3>Latest total</h3>
      <div class="big">${latest.total}</div>
      <div class="sub">${escapeHtml(latest.label)} · ${escapeHtml(latest.date.slice(0, 10))}</div>
    </div>
    <div class="tile">
      <h3>Latest critical / high</h3>
      <div class="big" style="color:var(--crit)">${latest.counts.critical}</div>
      <div class="sub">${latest.counts.high} high · ${latest.counts.medium} medium</div>
    </div>
    <div class="tile">
      <h3>Runs recorded</h3>
      <div class="big">${runs.length}</div>
      <div class="sub">first: ${escapeHtml(runs[runs.length - 1].date.slice(0, 10))}</div>
    </div>
    <div class="tile">
      <h3>Trend (last ${Math.min(runs.length, 10)})</h3>
      <div class="trend">${trend}</div>
      <div class="sub" style="margin-top:6px">critical · high · medium · low</div>
    </div>
  </section>

  <div class="toolbar">
    <button class="run-btn" id="runBtn" title="Trigger a new pentest run">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M3 2v8l7-4-7-4z" fill="currentColor"/>
      </svg>
      Run pentest
    </button>
    <label class="scanner-toggle" title="Also run nuclei / zap / nikto / gitleaks — expected ~3–7 min on localhost, ~10–20 min on a real host">
      <input type="checkbox" id="scannerToggle"> include external scanner <span style="color:var(--fg-faint); margin-left:4px">· adds ~3–7 min</span>
    </label>
    <input class="search" id="search" type="search" placeholder="Filter by label, date, host, slug…" aria-label="Filter runs">
    <span class="count" id="count">${runs.length} runs</span>
  </div>

  <details class="legend">
    <summary>
      <h3>How to read this dashboard <span class="hint">· what tools ran, what colors mean, what the deltas are</span></h3>
      <span class="arr">▸</span>
    </summary>
    <div class="body">
      <div>
        <h4>Severity</h4>
        <table>
          <tr><td><span class="pill crit">critical</span></td><td>Full system compromise possible. Fix before ship.</td></tr>
          <tr><td><span class="pill high">high</span></td><td>Meaningful data loss, account takeover, or DoS. Fix this sprint.</td></tr>
          <tr><td><span class="pill med">medium</span></td><td>Partial info leak, missing defense-in-depth, weak config. Fix soon.</td></tr>
          <tr><td><span class="pill low">low</span></td><td>Minor hygiene — cookie flags, header defaults, cosmetic leaks.</td></tr>
          <tr><td><span class="pill info">info</span></td><td>Informational — no direct risk, often dev-only or needs creds to validate.</td></tr>
        </table>
      </div>

      <div>
        <h4>Delta vs previous run</h4>
        <table>
          <tr><td><span class="pill up">+3</span></td><td>3 more findings than last run in this severity — regression.</td></tr>
          <tr><td><span class="pill down">-5</span></td><td>5 fewer findings than last run — fix landed.</td></tr>
          <tr><td><span class="pill">no pill</span></td><td>No change from previous.</td></tr>
        </table>
        <p style="margin-top:10px">Green = improvement, red = regression. Delta always compares to the <em>previous run by date</em>, not by label.</p>
      </div>

      <div>
        <h4>Source column (who found it)</h4>
        <table>
          <tr><td><span class="pill pw">playwright</span></td><td>One of our 13 Playwright-authored probes (headers, auth, CSRF, XSS, info-disclosure, trust-boundary, admin, agent-prompts, …). Knows this stack.</td></tr>
          <tr><td><span class="pill nu">nuclei</span></td><td>ProjectDiscovery — ~8 000 templated CVE / misconfig / exposure checks. Industry-standard, also what attackers run.</td></tr>
          <tr><td><span class="pill">zap-baseline</span></td><td>OWASP ZAP passive sweep in Docker. Classic OWASP Top 10 coverage.</td></tr>
          <tr><td><span class="pill sec">gitleaks</span></td><td>Secret detection in the current working tree.</td></tr>
          <tr><td><span class="pill sec">trufflehog</span></td><td>Verified-only secret detection across git history.</td></tr>
          <tr><td><span class="pill">nikto</span></td><td>Legacy web-server misconfig scanner (default files, outdated software headers).</td></tr>
          <tr><td><span class="pill">sslscan</span></td><td>TLS / cipher posture (informational in this report; raw XML in raw/).</td></tr>
          <tr><td><span class="pill">httpx / subfinder / dnsx</span></td><td>Passive recon — baseline probe, subdomain discovery, DNS resolution.</td></tr>
        </table>
      </div>

      <div>
        <h4>Run button</h4>
        <p><b>Default click</b> (unchecked) runs Playwright only — 13 custom probes against your 3 origins (~45 s).</p>
        <p><b>"include external scanner"</b> runs the 8 tools below <em>before</em> the Playwright pass, then merges all findings into one report. Use when: releasing, after a dep upgrade, weekly baseline. Never runs on production — only targets in <code>.claude/security/authorized-targets.yaml</code>, all non-destructive, rate-limited 10 r/s.</p>
      </div>

      <div class="spanfull" style="border-top:none; margin-top:0; padding-top:0; color:var(--fg-dim);">
        <h4 style="margin-top:8px">What "include external scanner" runs (in this order)</h4>
        <div class="scanner-list">
          <span class="tool">httpx</span><span class="purpose">Baseline HTTP probe — status, TLS handshake, tech fingerprint (Next.js version, Fastify, etc). Zero payloads.</span><span class="time">~5 s</span>
          <span class="tool">sslscan</span><span class="purpose">TLS audit — protocols supported, cipher suites, cert chain, HSTS posture.</span><span class="time">~5 s</span>
          <span class="tool">subfinder + dnsx</span><span class="purpose">Passive subdomain discovery + DNS resolution. Flags dangling CNAMEs (subdomain-takeover risk).</span><span class="time">~30 s</span>
          <span class="tool">gitleaks</span><span class="purpose">Secret detection in the current working tree. Runs with <code>--redact</code>, only fingerprints hit disk.</span><span class="time">~5 s</span>
          <span class="tool">trufflehog</span><span class="purpose">Secret detection across <em>git history</em>. Mode <code>--only-verified</code> — confirms the secret is still live before flagging.</span><span class="time">~30 s – 2 min</span>
          <span class="tool">nuclei</span><span class="purpose">ProjectDiscovery templates — 8 000+ checks for known CVEs, misconfigs, exposures. This is what attackers run first. Severity ≥ medium, excludes <code>intrusive,dos,brute-force,fuzz</code>.</span><span class="time">~1 – 3 min</span>
          <span class="tool">zap-baseline</span><span class="purpose">OWASP ZAP passive sweep in Docker. Classic OWASP Top-10 coverage (DOM XSS detection, inline-script counts, etc). Passive = zero active attack payloads.</span><span class="time">~2 – 5 min</span>
          <span class="tool">nikto</span><span class="purpose">Web-server misconfig scanner — default files, outdated-software headers, server-version leaks. Legacy but still finds real issues.</span><span class="time">~30 s – 2 min</span>
        </div>
        <p style="margin-top:12px">All outputs are normalized to the same finding schema and tagged with <code>source</code> so you can filter by tool inside any report.</p>
      </div>

      <div class="spanfull">
        Each row in the table below is a snapshot of findings at a point in time. Click any row to open that full report. Click <b>Run pentest</b> to create a new snapshot. History lives in <code>reports/history/</code> and this dashboard regenerates automatically on every run.
      </div>
    </div>
  </details>

  <section class="run-panel" id="runPanel" aria-live="polite">
    <div class="run-panel-header">
      <h3>Live output</h3>
      <div class="status">
        <span class="badge" id="runBadge"></span>
        <span id="runClock">—</span>
        <span id="runEta" style="color:var(--fg-faint)"></span>
        <button id="cancelBtn" style="background:transparent; border:1px solid color-mix(in srgb, var(--up) 40%, var(--line)); color:var(--up); padding:3px 10px; border-radius:6px; cursor:pointer; font-size:11px; font-family:var(--mono); display:none">Cancel</button>
      </div>
    </div>
    <div class="run-log" id="runLog"></div>
    <div class="actions" id="runActions" hidden>
      <a href="#" id="reloadLink">Reload dashboard ↻</a>
      <a id="latestLink" hidden>Open latest report →</a>
    </div>
  </section>

  <table class="runs">
    <thead>
      <tr>
        <th>#</th>
        <th>When</th>
        <th>Run</th>
        <th style="text-align:center">Crit</th>
        <th style="text-align:center">High</th>
        <th style="text-align:center">Med</th>
        <th style="text-align:center">Low</th>
        <th style="text-align:center">Info</th>
        <th style="text-align:right">Total</th>
        <th>Sources</th>
        <th></th>
      </tr>
    </thead>
    <tbody id="tbody">
      ${rows}
    </tbody>
  </table>
  `}

  <footer>Generated by <code>scripts/sec/render-history.ts</code> · self-contained, no network</footer>
</main>

<script>
  // ── Filtering ─────────────────────────────────────────────────────────
  (() => {
    const input = document.getElementById('search');
    const tbody = document.getElementById('tbody');
    const count = document.getElementById('count');
    if (!input || !tbody || !count) return;
    const rows = Array.from(tbody.querySelectorAll('tr.run'));
    const total = rows.length;
    input.addEventListener('input', (e) => {
      const q = String(e.target.value || '').trim().toLowerCase();
      let shown = 0;
      rows.forEach(r => {
        const text = (r.innerText || '').toLowerCase();
        const ok = !q || text.indexOf(q) !== -1;
        r.style.display = ok ? '' : 'none';
        if (ok) shown++;
      });
      count.textContent = shown === total ? total + ' runs' : shown + ' / ' + total + ' runs';
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
      if (e.key === 'Escape' && document.activeElement === input) { input.value=''; input.dispatchEvent(new Event('input')); input.blur(); }
    });
  })();

  // ── Run button + SSE log stream ───────────────────────────────────────
  // Requires the dev server (scripts/sec/server.ts). When the page is opened
  // as file:// the button is disabled with a tooltip explaining how to start
  // the server. When served via http://127.0.0.1:3030 (or similar), the
  // button POSTs /api/run and streams stdout/stderr into the log panel.
  (() => {
    const btn = document.getElementById('runBtn');
    const scannerToggle = document.getElementById('scannerToggle');
    const panel = document.getElementById('runPanel');
    const logEl = document.getElementById('runLog');
    const badge = document.getElementById('runBadge');
    const clock = document.getElementById('runClock');
    const actions = document.getElementById('runActions');
    const reloadLink = document.getElementById('reloadLink');
    if (!btn || !panel || !logEl || !badge || !clock) return;

    const isHttp = /^https?:$/.test(location.protocol);
    if (!isHttp) {
      btn.disabled = true;
      btn.title = 'Start the dev server first: npx tsx scripts/sec/server.ts  — then reopen at http://127.0.0.1:3030/history.html';
      const hint = document.createElement('div');
      hint.className = 'server-offline';
      hint.innerHTML = 'Run offline — see <b>banner above</b>';
      btn.parentElement.appendChild(hint);
      // Show the big top-of-page banner.
      const banner = document.getElementById('offlineBanner');
      if (banner) banner.hidden = false;
      return;
    }

    function setBadge(state, text) {
      badge.className = 'badge ' + state;
      badge.textContent = text;
    }

    function appendLine(line, stream) {
      const div = document.createElement('div');
      div.className = 'line-' + (stream || 'stdout');
      div.textContent = line;
      logEl.appendChild(div);
      logEl.scrollTop = logEl.scrollHeight;
    }

    const cancelBtn = document.getElementById('cancelBtn');
    const etaEl = document.getElementById('runEta');

    async function cancelRun() {
      try {
        await fetch('/api/run', { method: 'DELETE' });
        appendLine('→ cancel requested (SIGTERM sent)', 'stderr');
      } catch (e) { /* ignore */ }
    }
    if (cancelBtn) cancelBtn.addEventListener('click', cancelRun);

    function etaText(withScanner, elapsedMs) {
      // Rough budget:
      //   Playwright only: ~45 s
      //   Scanner + Playwright: 3–7 min on localhost
      const budgetS = withScanner ? 5 * 60 : 45;
      const elapsedS = Math.floor(elapsedMs / 1000);
      const remainS = Math.max(0, budgetS - elapsedS);
      if (remainS === 0) return withScanner ? '· running long (nuclei can stretch)' : '· finishing…';
      const m = Math.floor(remainS / 60);
      const s = remainS % 60;
      return '· ~' + (m ? m + 'm ' + s + 's' : s + 's') + ' left';
    }

    async function runPentest() {
      const withScanner = scannerToggle.checked;
      btn.disabled = true;
      panel.classList.add('open');
      logEl.textContent = '';
      actions.hidden = true;
      setBadge('running', withScanner ? 'running · scanner + playwright' : 'running · playwright');
      if (cancelBtn) cancelBtn.style.display = 'inline-block';

      const startedAt = Date.now();
      const tick = setInterval(() => {
        const ms = Date.now() - startedAt;
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        clock.textContent = m ? m + 'm ' + (s % 60) + 's' : s + 's';
        if (etaEl) etaEl.textContent = etaText(withScanner, ms);
      }, 500);

      try {
        const url = '/api/run' + (withScanner ? '?scanner=1' : '');
        const resp = await fetch(url, { method: 'POST' });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error('HTTP ' + resp.status + ' — ' + (body.error || 'request failed'));
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end;
          while ((end = buffer.indexOf('\\n\\n')) !== -1) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const lines = frame.split('\\n');
            let event = 'message';
            let data = null;
            for (const ln of lines) {
              if (ln.startsWith('event: ')) event = ln.slice(7).trim();
              if (ln.startsWith('data: ')) {
                try { data = JSON.parse(ln.slice(6)); } catch { /* ignore */ }
              }
            }
            if (event === 'started') {
              appendLine('→ run started (' + (data && data.includeScanner ? 'scanner+playwright' : 'playwright only') + ')');
            } else if (event === 'log' && data && data.line) {
              appendLine(data.line, data.stream);
            } else if (event === 'done' && data) {
              clearInterval(tick);
              if (etaEl) etaEl.textContent = '';
              if (cancelBtn) cancelBtn.style.display = 'none';
              const ok = data.code === 0;
              setBadge(ok ? 'ok' : 'err', ok ? 'done · exit 0' : 'failed · exit ' + data.code);
              appendLine('');
              appendLine(ok ? '✓ Completed.' : '✗ Failed (exit ' + data.code + ').');
              appendLine('Reload the page to see the new run in the table.');
              actions.hidden = false;
              reloadLink.onclick = (e) => { e.preventDefault(); location.reload(); };
            }
          }
        }
      } catch (err) {
        clearInterval(tick);
        if (etaEl) etaEl.textContent = '';
        if (cancelBtn) cancelBtn.style.display = 'none';
        setBadge('err', 'error');
        appendLine('error: ' + (err && err.message ? err.message : String(err)), 'stderr');
        actions.hidden = false;
        reloadLink.onclick = (e) => { e.preventDefault(); location.reload(); };
      } finally {
        btn.disabled = false;
        clearInterval(tick);
      }
    }

    btn.addEventListener('click', runPentest);

    // If a run is already in progress (e.g. page reloaded mid-run), subscribe.
    fetch('/api/status').then(r => r.ok ? r.json() : null).then((s) => {
      if (s && s.running) {
        // Attach to the existing stream.
        panel.classList.add('open');
        setBadge('running', 'running');
        btn.disabled = true;
        fetch('/api/stream').then(async (resp) => {
          if (!resp.ok) return;
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let end;
            while ((end = buffer.indexOf('\\n\\n')) !== -1) {
              const frame = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              const lines = frame.split('\\n');
              let event = 'message', data = null;
              for (const ln of lines) {
                if (ln.startsWith('event: ')) event = ln.slice(7).trim();
                if (ln.startsWith('data: ')) { try { data = JSON.parse(ln.slice(6)); } catch {} }
              }
              if (event === 'log' && data && data.line) appendLine(data.line, data.stream);
              else if (event === 'done' && data) {
                const ok = data.code === 0;
                setBadge(ok ? 'ok' : 'err', ok ? 'done · exit 0' : 'failed');
                appendLine(ok ? '\\n✓ Completed — reload to see the run.' : '\\n✗ Failed (exit ' + data.code + ').');
                actions.hidden = false;
                reloadLink.onclick = (e) => { e.preventDefault(); location.reload(); };
                btn.disabled = false;
              }
            }
          }
        });
      }
    }).catch(() => { /* server not present yet, fine */ });
  })();
</script>
</body>
</html>`;
}

function main() {
  const args = parseArgs();
  const runs = discover(args.historyDirs, args.output);
  const html = render(runs);
  writeFileSync(resolve(args.output), html, { mode: 0o644 });
  console.log(`✓ history dashboard: ${args.output} (${runs.length} runs)`);
}

main();
