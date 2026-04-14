import { createServiceClient } from '../supabase/index';

interface ChannelContextFields {
  language: string;
  region: string;
  market: string;
  tone: string | null;
  niche: string | null;
  nicheTags: string[] | null;
  name: string;
}

/**
 * Formats channel data into a system prompt context block.
 * Appended to agent system prompts at runtime so AI knows
 * target language, culture, tone, and niche.
 */
export function formatChannelContext(ch: ChannelContextFields): string {
  const lines: string[] = [
    '## Channel Context',
    '',
    `**CRITICAL — All output must target this channel's audience.**`,
    '',
    `- Channel: ${ch.name}`,
    `- Language: ${ch.language}`,
    `- Region: ${ch.region}`,
    `- Market: ${ch.market}`,
  ];

  if (ch.tone) {
    lines.push(`- Tone: ${ch.tone}`);
  }
  if (ch.niche) {
    lines.push(`- Niche: ${ch.niche}`);
  }
  if (ch.nicheTags && ch.nicheTags.length > 0) {
    lines.push(`- Niche Tags: ${ch.nicheTags.join(', ')}`);
  }

  if (!ch.language.startsWith('en')) {
    lines.push('');
    lines.push(`**ALL content output MUST be written in ${ch.language}.** Use cultural references appropriate for ${ch.region}. Adapt idioms, examples, humor, and analogies to resonate with a ${ch.region} audience.`);
  }

  return lines.join('\n');
}

/**
 * Fetches channel from DB and returns formatted context block.
 * Returns null if channelId is not provided or channel not found.
 */
export async function buildChannelContext(
  channelId: string | null | undefined,
): Promise<string | null> {
  if (!channelId) return null;

  const sb = createServiceClient();
  const { data, error } = await sb
    .from('channels')
    .select('name, language, region, market, tone, niche, niche_tags')
    .eq('id', channelId)
    .maybeSingle();

  if (error || !data) return null;

  return formatChannelContext({
    language: data.language,
    region: data.region,
    market: data.market,
    tone: data.tone,
    niche: data.niche,
    nicheTags: data.niche_tags,
    name: data.name,
  });
}
