export interface ResearchInput {
  ideaId?: string;
  ideaTitle?: string;
  coreTension?: string;
  targetAudience?: string;
  level?: string;
  instruction?: string;
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

  lines.push('');
  lines.push('Respond with a JSON object matching the output contract. No markdown, no commentary.');

  return lines.join('\n');
}
