export type ToolProvider = 'gemini' | 'openai' | 'anthropic' | 'ollama';

export interface ToolMeta {
  name: string;
  label: string;
  description: string;
  /** If set, only show this tool when the agent's provider is in this list. Omit to show for all non-Ollama providers. */
  supportedProviders?: Exclude<ToolProvider, 'ollama'>[];
  /** Env var that must be set on the server for this tool to work. */
  requiresEnv?: string;
}

/**
 * All tools available in the platform. Add an entry here when registering a
 * new tool in apps/api/src/lib/ai/tools/index.ts.
 */
export const TOOL_META: ToolMeta[] = [
  {
    name: 'search_web',
    label: 'Web Search',
    description: 'Search the web for real-time sources, statistics, and recent news. Best used by the research and brainstorm agents.',
    requiresEnv: 'SEARCH_API_KEY',
  },
  {
    name: 'fetch_url',
    label: 'Fetch URL',
    description: 'Fetch and read the text content of any public webpage. Useful for reading reference articles, documentation, or competitor content.',
  },
];

/**
 * Returns the tools that should be shown as toggles for a given provider.
 * Ollama never supports tools — returns empty.
 */
export function toolsForProvider(provider: string | null | undefined): ToolMeta[] {
  if (!provider || provider === 'ollama') return [];
  return TOOL_META.filter(
    t => !t.supportedProviders || t.supportedProviders.includes(provider as Exclude<ToolProvider, 'ollama'>),
  );
}
