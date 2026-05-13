export interface ResearchInput {
  ideaId?: string;
  ideaTitle?: string;
  coreTension?: string;
  targetAudience?: string;
  level?: string;
  instruction?: string;
  /**
   * When the prior draft was reviewed with verdict=revision_required, the
   * orchestrator threads the agent-4 feedback through to research so the
   * research agent can target the specific gaps (missing sources, weak
   * evidence on specific claims, etc.). Shape matches agent-4 output.
   */
  reviewFeedback?: {
    overall_verdict?: string;
    score?: number;
    critical_issues?: string[];
    minor_issues?: string[];
    strengths?: string[];
  } | null;
  channel?: {
    name?: string;
    niche?: string;
    language?: string;
    tone?: string;
  };
}

export function buildResearchMessage(input: ResearchInput): string {
  const lines: string[] = [];

  lines.push('Research the following content idea:');
  if (input.ideaTitle) lines.push(`Title: "${input.ideaTitle}"`);
  if (input.ideaId) lines.push(`ID: ${input.ideaId}`);
  if (input.coreTension) lines.push(`Core tension: ${input.coreTension}`);
  if (input.targetAudience) lines.push(`Target audience: ${input.targetAudience}`);

  if (input.level) {
    lines.push('');
    lines.push(`Research depth: ${input.level}`);
  }

  if (input.instruction) {
    lines.push('');
    lines.push(`Additional instruction: ${input.instruction}`);
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

  if (input.reviewFeedback) {
    const fb = input.reviewFeedback;
    lines.push('');
    lines.push('## Prior review feedback (re-research request)');
    lines.push(
      'The previous draft was reviewed and flagged as needing revision. Use the feedback below to drive deeper or more targeted research that closes the gaps. Prioritise sources/evidence that address the critical issues.',
    );
    if (fb.overall_verdict) lines.push(`Review verdict: ${fb.overall_verdict}`);
    if (fb.score != null) lines.push(`Review score: ${fb.score}`);
    if (fb.critical_issues?.length) {
      lines.push('');
      lines.push('Critical issues to address with research:');
      fb.critical_issues.forEach((i) => lines.push(`- ${i}`));
    }
    if (fb.minor_issues?.length) {
      lines.push('');
      lines.push('Minor issues worth strengthening:');
      fb.minor_issues.forEach((i) => lines.push(`- ${i}`));
    }
    if (fb.strengths?.length) {
      lines.push('');
      lines.push('Strengths to preserve (do not lose these in the new research):');
      fb.strengths.forEach((s) => lines.push(`- ${s}`));
    }
  }

  lines.push('');
  lines.push('Respond with a JSON object matching the output contract. No markdown, no commentary.');

  return lines.join('\n');
}
