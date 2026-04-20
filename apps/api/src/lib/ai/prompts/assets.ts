/**
 * Builds the user message for the assets agent.
 * Wraps BC_ASSETS_INPUT in a JSON code block and instructs the model to
 * return BC_ASSETS_OUTPUT matching the contract in agents/agent-5-assets.md.
 */
export interface AssetsPromptInput {
  title: string;
  content_type: string;
  sections: Array<{ slot: string; section_title: string; key_points: string[] }>;
  channel_context: Record<string, unknown>;
  idea_context: unknown;
}

export function buildAssetsMessage(input: AssetsPromptInput): string {
  const payload = {
    BC_ASSETS_INPUT: {
      title: input.title,
      content_type: input.content_type,
      sections: input.sections,
      channel_context: input.channel_context,
      ...(input.idea_context ? { idea_context: input.idea_context } : {}),
    },
  };

  return [
    'Generate visual prompt briefs for every section of this content piece.',
    '',
    'Input:',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
    '',
    'Return a valid JSON object matching the BC_ASSETS_OUTPUT contract exactly: { "visual_direction": {...}, "slots": [...] }. Output JSON only.',
  ].join('\n');
}
