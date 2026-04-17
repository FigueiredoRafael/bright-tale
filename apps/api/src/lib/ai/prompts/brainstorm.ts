export interface BrainstormInput {
  topic?: string;
  ideasRequested?: number;
  fineTuning?: {
    niche?: string;
    tone?: string;
    audience?: string;
    goal?: string;
    constraints?: string;
  };
  referenceUrl?: string;
  channel?: {
    name?: string;
    niche?: string;
    language?: string;
    tone?: string;
  };
}

export function buildBrainstormMessage(input: BrainstormInput): string {
  const count = input.ideasRequested ?? 5;
  const topic = input.topic?.trim();

  const lines: string[] = [];

  if (topic) {
    lines.push(`Generate ${count} content ideas about "${topic}".`);
  } else {
    lines.push(`Generate ${count} content ideas.`);
  }

  if (input.fineTuning) {
    const ft = input.fineTuning;
    const parts: string[] = [];
    if (ft.audience) parts.push(`- Audience: ${ft.audience}`);
    if (ft.niche) parts.push(`- Niche: ${ft.niche}`);
    if (ft.tone) parts.push(`- Tone: ${ft.tone}`);
    if (ft.goal) parts.push(`- Goal: ${ft.goal}`);
    if (ft.constraints) parts.push(`- Constraints: ${ft.constraints}`);
    if (parts.length > 0) {
      lines.push('');
      lines.push('Context:');
      lines.push(...parts);
    }
  }

  if (input.referenceUrl) {
    lines.push('');
    lines.push(`Reference content to model from: ${input.referenceUrl}`);
  }

  if (input.channel) {
    const ch = input.channel;
    const parts: string[] = [];
    if (ch.name) parts.push(`Channel: ${ch.name}`);
    if (ch.niche) parts.push(`Niche: ${ch.niche}`);
    if (ch.language) parts.push(`Language: ${ch.language}`);
    if (ch.tone) parts.push(`Tone: ${ch.tone}`);
    if (parts.length > 0) {
      lines.push('');
      lines.push(parts.join('\n'));
    }
  }

  lines.push('');
  lines.push('Respond with a JSON object matching the output contract. No markdown, no commentary.');

  return lines.join('\n');
}
