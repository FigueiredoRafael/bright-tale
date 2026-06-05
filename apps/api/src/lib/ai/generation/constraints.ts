/**
 * Shared helper: format persona constraint strings into a system-prompt block.
 * This text is prepended to the agent's system prompt so constraints override
 * all other instructions.
 */
export function formatConstraintsBlock(constraints: string[]): string {
  if (constraints.length === 0) return '';
  const lines = constraints.map((c) => `- ${c}`).join('\n');
  return `## Content Constraints\nThe following rules are non-negotiable and override all other instructions:\n${lines}\n\n`;
}
