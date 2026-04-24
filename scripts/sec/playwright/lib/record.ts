/**
 * record.ts — findings accumulator shared by all probes.
 *
 * Every probe calls `record(partial)`; at the end of the run,
 * orchestrator writes the normalized JSON that the existing
 * render-report.ts turns into HTML.
 */

import { createHash } from "node:crypto";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  cvss?: { vector: string; score: number };
  cwe?: string[];
  asvs?: string[];
  owasp?: string[];
  category?: string;
  stack_area?: string;
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
  discovered_at?: string;
  references?: string[];
  /** Which tool / probe raised this finding. e.g. "playwright:headers", "nuclei", "zap-baseline", "gitleaks". */
  source?: string;
}

export class Recorder {
  private items: Finding[] = [];

  constructor(
    private readonly defaultTags: string[] = [],
    private readonly defaultSource: string = "playwright",
  ) {}

  /** Append a finding. Auto-fills id (stable hash of category+title+location), source, and timestamp. */
  record(
    partial: Omit<Finding, "id" | "discovered_at"> & { id?: string; discovered_at?: string },
  ): Finding {
    const id =
      partial.id ??
      `FIND-${(partial.category ?? "other").replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${stableHash(partial.title, partial.location)}`;
    const f: Finding = {
      ...partial,
      id,
      discovered_at: partial.discovered_at ?? new Date().toISOString(),
      source: partial.source ?? this.defaultSource,
      tags: Array.from(new Set([...(partial.tags ?? []), ...this.defaultTags])),
    };
    this.items.push(f);
    return f;
  }

  /** Merge another set of findings in bulk (used by scanner parsers). */
  append(findings: Finding[]): void {
    for (const f of findings) this.items.push(f);
  }

  all(): Finding[] {
    return this.items;
  }

  counts(): Record<Severity, number> {
    const c: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of this.items) c[f.severity]++;
    return c;
  }
}

function stableHash(title: string, loc?: Finding["location"]): string {
  const parts = [title, loc?.url ?? "", loc?.file ?? "", loc?.method ?? ""].join("|");
  return createHash("sha256").update(parts).digest("hex").slice(0, 8);
}
