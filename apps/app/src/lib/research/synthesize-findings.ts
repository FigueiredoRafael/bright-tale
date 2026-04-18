/**
 * Group a legacy cards array (each card has url/title/credibility/etc.) into
 * the findings-object shape so ResearchFindingsReport can render it. Classifies
 * each card by shape: statistic = `figure`+`claim`, expert_quote = `quote`+`author`,
 * counterargument = `point`+`rebuttal`, source = any `url`/`credibility`/`key_insight`.
 */
export function synthesizeFindingsFromLegacy(
  cards: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const grouped: Record<string, Array<Record<string, unknown>>> = {
    sources: [],
    statistics: [],
    expert_quotes: [],
    counterarguments: [],
    misc: [],
  };
  for (const c of cards) {
    const type = typeof c.type === 'string' ? c.type.toLowerCase() : '';
    if (type === 'statistic' || type === 'stat' || ('figure' in c && 'claim' in c)) {
      grouped.statistics.push(c);
    } else if (type === 'expert_quote' || type === 'quote' || ('quote' in c && 'author' in c)) {
      grouped.expert_quotes.push(c);
    } else if (type === 'counterargument' || ('point' in c && 'rebuttal' in c)) {
      grouped.counterarguments.push(c);
    } else if (type === 'source' || 'url' in c || 'credibility' in c || 'key_insight' in c) {
      grouped.sources.push(c);
    } else {
      grouped.misc.push(c);
    }
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(grouped)) {
    if (v.length > 0) out[k] = v;
  }
  return out;
}
