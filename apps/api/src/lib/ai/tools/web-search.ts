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

interface SerperOrganicResult {
  title: string;
  link: string;
  snippet: string;
  position?: number;
}

interface SerperResponse {
  organic?: SerperOrganicResult[];
  knowledgeGraph?: { description?: string };
  answerBox?: { answer?: string; snippet?: string };
}

export async function executeWebSearch(args: { query: string; max_results?: number }): Promise<string> {
  const key = process.env.SEARCH_API_KEY;
  if (!key) {
    return JSON.stringify({ error: 'Web search not available — set SEARCH_API_KEY to enable.', results: [] });
  }

  const num = Math.min(Math.max(args.max_results ?? 5, 1), 10);

  let raw: SerperResponse;
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: args.query, num }),
    });
    if (!res.ok) {
      return JSON.stringify({ error: `Serper API error ${res.status}`, results: [] });
    }
    raw = await res.json() as SerperResponse;
  } catch (err) {
    return JSON.stringify({ error: `Search request failed: ${String(err)}`, results: [] });
  }

  const results = (raw.organic ?? []).slice(0, num).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet,
  }));

  const extras: Record<string, string> = {};
  if (raw.answerBox?.answer) extras.answer_box = raw.answerBox.answer;
  else if (raw.answerBox?.snippet) extras.answer_box = raw.answerBox.snippet;
  if (raw.knowledgeGraph?.description) extras.knowledge_graph = raw.knowledgeGraph.description;

  return JSON.stringify({ results, ...extras });
}
