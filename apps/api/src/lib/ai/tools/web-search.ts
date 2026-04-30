import type { ToolDefinition } from '../provider.js';

export const webSearchTool: ToolDefinition = {
  name: 'search_web',
  description:
    'Search the web for current, factual information. Use this to find real sources, statistics, expert opinions, and recent news about a topic. Call multiple times with different queries to build comprehensive research.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query. Be specific for better results (e.g., "AI content creation statistics 2024" not just "AI").',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (1–10). Defaults to 5.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  strict: false,
};

export async function executeWebSearch(args: { query: string; max_results?: number }): Promise<string> {
  const key = process.env.SEARCH_API_KEY;
  if (!key) {
    return JSON.stringify({ error: 'Web search not available — set SEARCH_API_KEY to enable.', results: [] });
  }

  // TODO: wire to your chosen search provider (Brave, Serper, Exa, etc.)
  // The SEARCH_API_KEY env var is the single point of configuration.
  return JSON.stringify({ error: 'Search provider not yet configured. Implement executeWebSearch in apps/api/src/lib/ai/tools/web-search.ts.', results: [] });
}
