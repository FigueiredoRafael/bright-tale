import type { ToolDefinition, ToolCall, ToolResult, ToolExecutor } from '../provider.js';
import { webSearchTool, executeWebSearch } from './web-search.js';
import { fetchUrlTool, executeFetchUrl } from './fetch-url.js';
export type { ToolMeta } from '@brighttale/shared';
export { TOOL_META, toolsForProvider } from '@brighttale/shared';

type ToolExecutorFn = (args: Record<string, unknown>) => Promise<string>;

/** Central registry of tool definitions, keyed by name. */
export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  search_web: webSearchTool,
  fetch_url: fetchUrlTool,
};

/** Central registry of tool executor functions, keyed by name. */
export const EXECUTOR_REGISTRY: Record<string, ToolExecutorFn> = {
  search_web: (args) => executeWebSearch(args as { query: string; max_results?: number }),
  fetch_url: (args) => executeFetchUrl(args as { url: string }),
};

/** Resolve a list of tool names to their ToolDefinition objects. Unknown names are silently skipped. */
export function resolveTools(toolNames: string[]): ToolDefinition[] {
  return toolNames.flatMap(name => (TOOL_REGISTRY[name] ? [TOOL_REGISTRY[name]] : []));
}

/** Build a generic executor for any combination of registered tools. */
export function buildToolExecutor(enabledTools: ToolDefinition[]): ToolExecutor {
  const names = new Set(enabledTools.map(t => t.name));
  return async (calls: ToolCall[]): Promise<ToolResult[]> => {
    return Promise.all(
      calls.map(async (call): Promise<ToolResult> => {
        const executor = EXECUTOR_REGISTRY[call.name];
        if (names.has(call.name) && executor) {
          return { toolCallId: call.id, content: await executor(call.arguments) };
        }
        return { toolCallId: call.id, content: JSON.stringify({ error: `Unknown tool: ${call.name}` }) };
      }),
    );
  };
}
