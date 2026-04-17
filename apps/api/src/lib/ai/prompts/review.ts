import type { IdeaContext } from '../loadIdeaContext.js';

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
  lines.push(`Title: "${input.title}"`);

  if (input.contentTypesRequested?.length) {
    lines.push(`Content types to review: ${input.contentTypesRequested.join(', ')}`);
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
