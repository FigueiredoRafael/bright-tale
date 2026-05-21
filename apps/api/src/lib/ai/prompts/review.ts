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
  lines.push(`Title: "${input.title}"`);

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
      'Convergence rule: if any critical issue from a previous attempt still applies to the current draft, your score MUST NOT exceed (previous_score + 5). If every prior critical issue has been addressed, score on the current merits.',
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
