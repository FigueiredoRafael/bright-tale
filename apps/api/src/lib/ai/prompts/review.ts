import type { IdeaContext } from '../loadIdeaContext.js';

export interface PriorReviewAttempt {
  attemptNo: number;
  score: number | null;
  verdict: string;
  criticalIssues: string[];
  minorIssues: string[];
}

export interface ReviewInput {
  type: string;
  title: string;
  draftJson: unknown;
  canonicalCore?: unknown;
  idea?: IdeaContext | null;
  research?: unknown;
  contentTypesRequested?: string[];
  channel?: { name?: string; niche?: string; language?: string; tone?: string };
  /**
   * Earlier review attempts on this same draft (most recent first). Lets the
   * reviewer judge convergence — whether prior critical issues were addressed
   * — instead of treating every attempt as fresh. Stateless per provider; we
   * inline the relevant history into the prompt.
   */
  priorAttempts?: PriorReviewAttempt[];
}

export function buildReviewMessage(input: ReviewInput): string {
  const lines: string[] = [];

  lines.push(`Review the following ${input.type} draft.`);
  // Guard against the database storing a null title (which template-literals
  // coerce to the string "null"). Falls back to the draftJson.title when the
  // top-level column is empty.
  const resolvedTitle =
    (typeof input.title === 'string' && input.title.trim().length > 0 && input.title !== 'null'
      ? input.title
      : null) ??
    (input.draftJson && typeof input.draftJson === 'object'
      ? (() => {
          const root = input.draftJson as Record<string, unknown>;
          const inner = (root[input.type] && typeof root[input.type] === 'object'
            ? (root[input.type] as Record<string, unknown>)
            : root) as Record<string, unknown>;
          const t = inner.title ?? root.title;
          return typeof t === 'string' && t.trim().length > 0 ? t : null;
        })()
      : null);
  if (resolvedTitle) {
    lines.push(`Title: "${resolvedTitle}"`);
  }

  if (input.contentTypesRequested?.length) {
    lines.push(`Content types to review: ${input.contentTypesRequested.join(', ')}`);
  }

  if (input.priorAttempts && input.priorAttempts.length > 0) {
    lines.push('');
    lines.push('Previous review attempts on this draft (most recent first):');
    for (const a of input.priorAttempts) {
      const scoreStr = a.score != null ? String(a.score) : 'n/a';
      lines.push(`- Attempt #${a.attemptNo} — verdict=${a.verdict}, score=${scoreStr}`);
      if (a.criticalIssues.length > 0) {
        lines.push(`  critical: ${JSON.stringify(a.criticalIssues)}`);
      }
      if (a.minorIssues.length > 0) {
        lines.push(`  minor: ${JSON.stringify(a.minorIssues)}`);
      }
    }
    lines.push('');
    lines.push(
      'Per-prior-critical evaluation (REQUIRED — do this before scoring):',
    );
    lines.push(
      '- For each prior critical issue, judge whether it STILL applies to the CURRENT draft, which may have been substantively rewritten between attempts.',
    );
    lines.push(
      '- To re-assert a prior critical, you MUST quote the specific passage from the CURRENT draft that demonstrates the problem (the evidence must come from the current draft, not paraphrase the prior wording). Put the quote inside the issue\'s `suggested_fix` or `issue` field. If you cannot quote current-draft evidence, the issue has been addressed — DO NOT relist it as critical.',
    );
    lines.push(
      '- Treating a prior critical as "still applies" without quoted current-draft evidence is a calibration failure: the producer may have legitimately fixed it (different opening, restructured paragraphs, new framing) and you are anchoring on stale memory.',
    );
    lines.push('');
    lines.push('Convergence rules (apply in order):');
    lines.push(
      '1. If the current draft genuinely addresses all prior criticals without introducing new ones of equal severity, score MUST be >= the most recent prior score. The producer earned the gain.',
    );
    lines.push(
      '2. If you re-assert a prior critical with quoted current-draft evidence AND no new severity emerged, score MUST NOT exceed (previous_score + 5) — this prevents oscillation when nothing substantive changed.',
    );
    lines.push(
      '3. If the current draft is genuinely worse than the prior (regression, dropped sections, broken structure), score lower than prior and explain why in `notes`.',
    );
  }

  lines.push('');
  lines.push('Draft to review:');
  lines.push(typeof input.draftJson === 'string' ? input.draftJson : JSON.stringify(input.draftJson, null, 2));

  if (input.canonicalCore) {
    lines.push('');
    lines.push('Canonical core (reference):');
    lines.push(typeof input.canonicalCore === 'string' ? input.canonicalCore : JSON.stringify(input.canonicalCore, null, 2));
  }

  if (input.idea) {
    lines.push('');
    lines.push('Original idea:');
    lines.push(typeof input.idea === 'string' ? input.idea : JSON.stringify(input.idea, null, 2));
  }

  if (input.research) {
    lines.push('');
    lines.push('Research data:');
    lines.push(typeof input.research === 'string' ? input.research : JSON.stringify(input.research, null, 2));
  }

  if (input.channel) {
    const ch = input.channel;
    const parts: string[] = [];
    if (ch.name) parts.push(`Channel: ${ch.name}`);
    if (ch.language) parts.push(`Language: ${ch.language}`);
    if (ch.niche) parts.push(`Niche: ${ch.niche}`);
    if (parts.length > 0) {
      lines.push('');
      lines.push(parts.join('\n'));
    }
  }

  lines.push('');
  lines.push('Respond with a JSON object matching the output contract. No markdown, no commentary.');

  return lines.join('\n');
}
