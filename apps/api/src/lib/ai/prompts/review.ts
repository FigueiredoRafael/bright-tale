import type { IdeaContext } from '../loadIdeaContext.js';

/**
 * Shape of a prior review attempt. Kept exported here because the production
 * reproduce prompt (apps/api/src/lib/ai/prompts/production.ts) consumes the
 * same type — the PRODUCER uses prior-attempts memory to see what fixes it
 * already tried. The reviewer itself does NOT take priorAttempts anymore:
 * giving the reviewer past criticals caused it to anchor on stale flags and
 * stop seeing genuine improvements, even when the producer substantively
 * rewrote the flagged sections. Reviewer is back to stateless per call.
 */
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

  // The review agent's BC_REVIEW_INPUT contract expects the draft under
  // `production.<type>.{...}` (see agents/agent-4-review.md). The producer
  // stores draft_json flat (`{title, slug, full_draft, ...}` direct at root
  // for blogs) because UI consumers read it that way. Without re-wrapping
  // here, the reviewer reports "Missing required field: production.blog.full_draft"
  // even though the field is present — it just lives at a different path.
  // Normalize to the contract shape before serializing.
  const draftForReview = (() => {
    if (!input.draftJson || typeof input.draftJson !== 'object') {
      return { production: { [input.type]: input.draftJson } };
    }
    const root = input.draftJson as Record<string, unknown>;
    // Already wrapped (`{production: {blog: {...}}}`) — pass through.
    if (root.production && typeof root.production === 'object') return root;
    // Half-wrapped (`{blog: {...}}` or `{video: {...}}` etc.) — promote to
    // `production.<type>`.
    if (root[input.type] && typeof root[input.type] === 'object') {
      return { production: { [input.type]: root[input.type] } };
    }
    // Flat (`{title, full_draft, ...}` direct) — wrap under production.<type>.
    return { production: { [input.type]: root } };
  })();

  lines.push('');
  lines.push('Draft to review:');
  lines.push(JSON.stringify(draftForReview, null, 2));

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
