import type { IdeaContext } from '../loadIdeaContext.js';

export interface CanonicalCoreInput {
  type: string;
  title: string;
  ideaId?: string;
  idea?: IdeaContext | null;
  researchCards?: unknown[];
  productionParams?: unknown;
  channel?: { name?: string; niche?: string; language?: string; tone?: string };
}

export interface ProduceInput {
  type: string;
  title: string;
  canonicalCore: unknown;
  idea?: IdeaContext | null;
  productionParams?: unknown;
  sources?: unknown[];
  channel?: { name?: string; niche?: string; language?: string; tone?: string };
}

export interface ReproduceInput {
  type: string;
  title: string;
  canonicalCore?: unknown;
  previousDraft?: unknown;
  idea?: IdeaContext | null;
  reviewFeedback: {
    overall_verdict?: string;
    score?: number | null;
    critical_issues?: string[];
    minor_issues?: string[];
    strengths?: string[];
  };
  channel?: { name?: string; niche?: string; language?: string; tone?: string };
}

function channelBlock(ch?: { name?: string; niche?: string; language?: string; tone?: string }): string {
  if (!ch) return '';
  const parts: string[] = [];
  if (ch.name) parts.push(`Channel: ${ch.name}`);
  if (ch.language) parts.push(`Language: ${ch.language}`);
  if (ch.niche) parts.push(`Niche: ${ch.niche}`);
  if (ch.tone) parts.push(`Tone: ${ch.tone}`);
  return parts.length > 0 ? '\n' + parts.join('\n') : '';
}

function jsonBlock(data: unknown): string {
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

export function buildCanonicalCoreMessage(input: CanonicalCoreInput): string {
  const lines: string[] = [];
  lines.push(`Generate a canonical core for a ${input.type} content piece.`);
  lines.push(`Title: "${input.title}"`);
  if (input.ideaId) lines.push(`Idea ID: ${input.ideaId}`);

  if (input.idea) {
    lines.push('');
    lines.push('Selected idea:');
    lines.push(jsonBlock(input.idea));
  }

  if (input.researchCards) {
    lines.push('');
    lines.push('Approved research cards:');
    lines.push(jsonBlock(input.researchCards));
  }

  if (input.productionParams) {
    lines.push('');
    lines.push('Production parameters:');
    lines.push(jsonBlock(input.productionParams));
  }

  lines.push(channelBlock(input.channel));
  lines.push('');
  lines.push('Respond with a JSON object matching the output contract. No markdown, no commentary.');
  return lines.join('\n');
}

export function buildProduceMessage(input: ProduceInput): string {
  const lines: string[] = [];
  lines.push(`Produce a ${input.type} draft from the canonical core below.`);
  lines.push(`Title: "${input.title}"`);

  if (input.idea) {
    lines.push('');
    lines.push('Original idea context:');
    lines.push(jsonBlock(input.idea));
  }

  lines.push('');
  lines.push('Canonical core:');
  lines.push(jsonBlock(input.canonicalCore));

  if (input.productionParams) {
    lines.push('');
    lines.push('Production parameters:');
    lines.push(jsonBlock(input.productionParams));
  }

  if (input.sources && Array.isArray(input.sources) && input.sources.length > 0) {
    lines.push('');
    lines.push('Research sources (include referenced ones in ## Sources section of full_draft):');
    lines.push(jsonBlock(input.sources));
  }

  lines.push(channelBlock(input.channel));
  lines.push('');
  lines.push('Respond with a JSON object matching the output contract. No markdown, no commentary.');
  return lines.join('\n');
}

export function buildReproduceMessage(input: ReproduceInput): string {
  const lines: string[] = [];
  lines.push(`Revise the ${input.type} draft based on review feedback.`);
  lines.push(`Title: "${input.title}"`);
  lines.push('');
  lines.push(`Review verdict: ${input.reviewFeedback.overall_verdict ?? 'unknown'}`);
  if (input.reviewFeedback.score != null) lines.push(`Score: ${input.reviewFeedback.score}`);
  if (input.reviewFeedback.critical_issues?.length) {
    lines.push('');
    lines.push('Critical issues to fix:');
    input.reviewFeedback.critical_issues.forEach((i) => lines.push(`- ${i}`));
  }
  if (input.reviewFeedback.minor_issues?.length) {
    lines.push('');
    lines.push('Minor issues to fix:');
    input.reviewFeedback.minor_issues.forEach((i) => lines.push(`- ${i}`));
  }
  if (input.reviewFeedback.strengths?.length) {
    lines.push('');
    lines.push('Strengths to keep:');
    input.reviewFeedback.strengths.forEach((s) => lines.push(`- ${s}`));
  }

  if (input.idea) {
    lines.push('');
    lines.push('Original idea context:');
    lines.push(jsonBlock(input.idea));
  }

  if (input.canonicalCore) {
    lines.push('');
    lines.push('Canonical core:');
    lines.push(jsonBlock(input.canonicalCore));
  }

  if (input.previousDraft) {
    lines.push('');
    lines.push('Previous draft:');
    lines.push(jsonBlock(input.previousDraft));
  }

  lines.push(channelBlock(input.channel));
  lines.push('');
  lines.push('Fix the issues, keep the strengths. Respond with a JSON object matching the output contract. No markdown, no commentary.');
  return lines.join('\n');
}
