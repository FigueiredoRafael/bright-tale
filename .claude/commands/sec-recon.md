---
description: Passive recon — map attack surface of a target URL or the local repo. Zero payloads.
argument-hint: "[url]"
---

# /sec-recon

Invoke the `bright-tale-sec` agent in **recon** mode.

## Input

- `$1` (optional): URL to map. If omitted, agent runs against the current repo + `localhost:3000`, `localhost:3001`, `localhost:3002`.

## What the agent does

1. Reads `.claude/security/authorized-targets.yaml`.
2. Matches the target host. If no match, stops and asks.
3. Runs **passive only** — no active payloads, no auth probing, no form submission.
4. Produces a structured inventory at `.claude/security/findings/recon-<timestamp>.json`.
5. Renders a short HTML at `reports/recon-<host>-<timestamp>.html`.
6. Prints the summary: routes, envs, secrets-in-repo count, TLS posture, missing headers, dangling DNS.

## Agent instructions

Delegate to the `bright-tale-sec` subagent with the following prompt, verbatim:

> Run mode = `recon` against target `$1` (or local defaults if empty). Follow every rule in your system prompt. Zero active payloads. Respect `authorized-targets.yaml`. Output: JSON inventory + short HTML. Report to chat: severity counts + top 3 anomalies + 1-sentence posture assessment.

## Post-run

Agent prints the HTML path. User opens with `open <path>` if desired.

No files under `apps/`, `packages/`, `supabase/` are modified.
