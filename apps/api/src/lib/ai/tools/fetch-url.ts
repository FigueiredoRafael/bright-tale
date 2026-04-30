import type { ToolDefinition } from '../provider.js';

export const fetchUrlTool: ToolDefinition = {
  name: 'fetch_url',
  description:
    'Fetch and read the text content of a public webpage. Use this to read a reference article, verify a claim, or extract information from a specific URL.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The full URL to fetch (must be https://).',
      },
    },
    required: ['url'],
    additionalProperties: false,
  },
  strict: true,
};

const MAX_CHARS = 8000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function executeFetchUrl(args: { url: string }): Promise<string> {
  const { url } = args;

  if (!url.startsWith('https://')) {
    return JSON.stringify({ error: 'Only https:// URLs are supported.' });
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrightTaleBot/1.0)' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return JSON.stringify({ error: `HTTP ${response.status}: ${response.statusText}`, url });
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/')) {
      return JSON.stringify({ error: `Unsupported content type: ${contentType}`, url });
    }

    const text = stripHtml(await response.text());
    return JSON.stringify({
      url,
      content: text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + '… [truncated]' : text,
    });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : 'Fetch failed', url });
  }
}
