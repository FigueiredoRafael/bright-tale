#!/usr/bin/env -S npx tsx
/**
 * server.ts — tiny dev-only HTTP server for the pentest dashboard.
 *
 * What it does:
 *   • Serves `reports/` as static (dashboard, per-run reports, baselines).
 *   • POST /api/run        — spawns `scripts/sec/playwright/pentest.ts` and
 *                            streams stdout/stderr back as Server-Sent Events.
 *   • POST /api/run?scanner=1
 *                          — runs `scripts/sec/run-pentest.sh` first (slow),
 *                            then the Playwright orchestrator.
 *   • GET /api/status      — returns `{ running: bool, startedAt }` for UI state.
 *
 * Security / scope:
 *   • Binds to 127.0.0.1 only (no LAN / Docker exposure).
 *   • Serves only files inside `reports/` — path traversal rejected.
 *   • One concurrent run at a time (returns 409 if busy).
 *   • No auth — this is a local dev tool. Do not deploy.
 *
 * Usage:
 *   npx tsx scripts/sec/server.ts           # defaults: 127.0.0.1:3030
 *   npx tsx scripts/sec/server.ts --port=3040
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, extname, relative, normalize, sep } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

// ── Config ────────────────────────────────────────────────────────────────
const HOST = "127.0.0.1";
const DEFAULT_PORT = 3030;
const ROOT = process.cwd();
const SERVE_ROOT = resolve(ROOT, "reports");

let PORT = DEFAULT_PORT;
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--port=(\d+)$/);
  if (m) PORT = Number(m[1]);
}

// ── State ─────────────────────────────────────────────────────────────────
let currentRun: {
  child: ChildProcess;
  startedAt: string;
  subscribers: Set<ServerResponse>;
  log: string[];
  exitCode: number | null;
} | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
  });
  res.end(buf);
}

function sendStatic(res: ServerResponse, urlPath: string) {
  // Default to history.html
  if (urlPath === "/" || urlPath === "") urlPath = "/history.html";

  // Resolve safely inside SERVE_ROOT.
  const filePath = resolve(SERVE_ROOT, "." + decodeURIComponent(urlPath));
  const rel = relative(SERVE_ROOT, filePath);
  if (rel.startsWith("..") || rel.includes(sep + "..")) {
    return sendJson(res, 400, { error: "path-traversal-denied" });
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return sendJson(res, 404, { error: "not-found", path: urlPath });
  }
  const body = readFileSync(filePath);
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    // Only served to localhost, so relaxed CSP is acceptable here.
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  res.end(body);
}

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function broadcast(event: string, data: unknown) {
  if (!currentRun) return;
  const frame = sseFrame(event, data);
  for (const sub of currentRun.subscribers) {
    try {
      sub.write(frame);
    } catch {
      currentRun.subscribers.delete(sub);
    }
  }
}

function startRun(includeScanner: boolean, res: ServerResponse) {
  if (currentRun && currentRun.exitCode === null) {
    return sendJson(res, 409, { error: "already-running", startedAt: currentRun.startedAt });
  }

  const startedAt = new Date().toISOString();
  const log: string[] = [];
  const subscribers = new Set<ServerResponse>();

  // Set up SSE headers for the initiating client so it also receives the stream.
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  subscribers.add(res);

  // Compose: optional scanner script → then playwright orchestrator.
  const cmd = includeScanner
    ? `bash scripts/sec/run-pentest.sh localhost:3000 active-light 10 ".claude/security/run-$(date +%Y%m%dT%H%M%S)" && npx tsx scripts/sec/playwright/pentest.ts`
    : `npx tsx scripts/sec/playwright/pentest.ts`;

  const child = spawn("bash", ["-c", cmd], {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: "0", CI: "1" },
  });

  currentRun = {
    child,
    startedAt,
    subscribers,
    log,
    exitCode: null,
  };

  const initialMeta = {
    startedAt,
    includeScanner,
    pid: child.pid,
  };
  res.write(sseFrame("started", initialMeta));

  const forward = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
    const text = chunk.toString();
    // Strip ANSI codes so client doesn't show raw escape sequences.
    const clean = text.replace(/\[[0-9;]*m/g, "");
    for (const rawLine of clean.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (!line) continue;
      log.push(line);
      broadcast("log", { line, stream });
    }
  };
  child.stdout!.on("data", forward("stdout"));
  child.stderr!.on("data", forward("stderr"));

  child.on("exit", (code) => {
    if (!currentRun) return;
    currentRun.exitCode = code ?? -1;
    broadcast("done", {
      code,
      startedAt,
      endedAt: new Date().toISOString(),
      logLines: log.length,
    });
    // Close all SSE streams.
    for (const sub of subscribers) {
      try {
        sub.end();
      } catch { /* ignore */ }
    }
  });

  // Client disconnect → drop from subscribers. Don't kill the run because
  // other subscribers may still be listening and the work is useful.
  res.req.on("close", () => {
    if (!currentRun) return;
    currentRun.subscribers.delete(res);
  });
}

function subscribeToRun(res: ServerResponse) {
  if (!currentRun) {
    return sendJson(res, 404, { error: "no-active-run" });
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  // Replay log so the client sees history.
  res.write(sseFrame("replay-start", { startedAt: currentRun.startedAt, lines: currentRun.log.length }));
  for (const line of currentRun.log) {
    res.write(sseFrame("log", { line, stream: "stdout" }));
  }
  if (currentRun.exitCode !== null) {
    res.write(sseFrame("done", { code: currentRun.exitCode }));
    res.end();
    return;
  }
  currentRun.subscribers.add(res);
  res.req.on("close", () => currentRun?.subscribers.delete(res));
}

// ── Router ────────────────────────────────────────────────────────────────
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

  // Minimal CORS: allow only same-origin.
  res.setHeader("Access-Control-Allow-Origin", `http://${HOST}:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (url.pathname === "/api/status") {
    return sendJson(res, 200, {
      running: !!currentRun && currentRun.exitCode === null,
      startedAt: currentRun?.startedAt ?? null,
      exitCode: currentRun?.exitCode ?? null,
    });
  }

  if (url.pathname === "/api/run") {
    if (req.method === "DELETE") {
      // Cancel the current run.
      if (!currentRun || currentRun.exitCode !== null) {
        return sendJson(res, 404, { error: "no-active-run" });
      }
      currentRun.child.kill("SIGTERM");
      // Give it 3s to clean up, then SIGKILL.
      setTimeout(() => {
        if (currentRun && currentRun.exitCode === null) {
          try { currentRun.child.kill("SIGKILL"); } catch {}
        }
      }, 3000).unref();
      return sendJson(res, 200, { ok: true, killed: true });
    }
    if (req.method !== "POST") {
      return sendJson(res, 405, { error: "method-not-allowed" });
    }
    const withScanner = url.searchParams.get("scanner") === "1";
    return startRun(withScanner, res);
  }

  if (url.pathname === "/api/stream") {
    return subscribeToRun(res);
  }

  // Static fallback.
  if (req.method === "GET") {
    return sendStatic(res, url.pathname);
  }
  return sendJson(res, 405, { error: "method-not-allowed" });
});

server.listen(PORT, HOST, () => {
  const banner = `
┌──────────────────────────────────────────────────────────────┐
│  BrightSec pentest dashboard                                 │
│  http://${HOST}:${PORT}/history.html                          │
│                                                              │
│  Click "Run pentest" on the page to trigger a new run.       │
│  Press Ctrl+C to stop the server.                            │
└──────────────────────────────────────────────────────────────┘
`;
  console.log(banner);
});

// Clean shutdown.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    if (currentRun && currentRun.exitCode === null) {
      currentRun.child.kill("SIGTERM");
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 2000).unref();
  });
}
