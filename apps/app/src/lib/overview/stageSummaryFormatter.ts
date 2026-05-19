/**
 * stageSummaryFormatter — one-line humanized summaries for the Overview panel's
 * "last output" slot. Each function accepts an `outcomeJson` of unknown shape
 * and must not throw, even on null / missing / malformed data.
 *
 * Shapes are derived from:
 *  - packages/shared/src/types/agents.ts (BC_* agent contracts)
 *  - packages/shared/src/types/database.ts (stage_runs.outcome_json shapes)
 *  - ProjectContextProvider.ts (deriveStageResults mapping keys)
 */

// ─── Safe accessor helpers ─────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  return '';
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && isFinite(value)) return value;
  return null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [];
}

// ─── Stage formatters ─────────────────────────────────────────────────────────

/**
 * Brainstorm — surface the selected idea title.
 * outcomeJson shape: { ideaTitle?: string }
 */
export function summarizeBrainstorm(outcomeJson: unknown): string {
  const rec = asRecord(outcomeJson);
  if (!rec) return 'No brainstorm data';
  const title = asString(rec.ideaTitle);
  if (title) return title;
  // Fallback: try nested idea shapes
  const ideas = asArray(rec.ideas);
  if (ideas.length > 0) {
    const first = asRecord(ideas[0]);
    const firstTitle = first ? asString(first.title) : '';
    if (firstTitle) return firstTitle;
  }
  return 'No idea selected';
}

/**
 * Research — "N cards approved"
 * outcomeJson shape: { approvedCardsCount?: number }
 */
export function summarizeResearch(outcomeJson: unknown): string {
  const rec = asRecord(outcomeJson);
  if (!rec) return 'No research data';
  const count = asNumber(rec.approvedCardsCount);
  if (count !== null) {
    return count === 1 ? '1 card approved' : `${count} cards approved`;
  }
  // Fallback: count sources array
  const sources = asArray(rec.sources);
  if (sources.length > 0) {
    return `${sources.length} sources gathered`;
  }
  return 'Research complete';
}

/**
 * Canonical — outline summary (H1 title + H2 list, comma-joined)
 * outcomeJson shape: { draftTitle?: string } + stored draft has outline[]
 * Also handles CanonicalCore shape: { thesis?: string, argument_chain?: [{claim}] }
 */
export function summarizeCanonical(outcomeJson: unknown): string {
  const rec = asRecord(outcomeJson);
  if (!rec) return 'No canonical data';

  const draftTitle = asString(rec.draftTitle);
  if (draftTitle) return draftTitle;

  // CanonicalCore shape
  const thesis = asString(rec.thesis);
  const argumentChain = asArray(rec.argument_chain);
  if (thesis) {
    if (argumentChain.length > 0) {
      const claims = argumentChain
        .slice(0, 3)
        .map((step) => asString(asRecord(step)?.claim))
        .filter(Boolean);
      if (claims.length > 0) {
        return `${thesis} — ${claims.join(', ')}`;
      }
    }
    return thesis;
  }

  // BlogOutput outline shape
  const outline = asArray(rec.outline);
  if (outline.length > 0) {
    const h2s = outline
      .slice(0, 4)
      .map((section) => asString(asRecord(section)?.h2))
      .filter(Boolean);
    if (h2s.length > 0) return h2s.join(', ');
  }

  return 'Canonical core complete';
}

/**
 * Production — "X words — first 200 chars…"
 * outcomeJson shape: { draftContent?: string } (stored in content_drafts, surfaced via payloadRef)
 * Also handles BlogOutput shape: { full_draft?: string, word_count?: number }
 */
export function summarizeProduction(outcomeJson: unknown): string {
  const rec = asRecord(outcomeJson);
  if (!rec) return 'No production data';

  // Prefer draftContent (from deriveStageResults mapping)
  const draftContent = asString(rec.draftContent);
  if (draftContent) {
    const words = draftContent.split(/\s+/).filter(Boolean).length;
    const preview = draftContent.slice(0, 200);
    const suffix = draftContent.length > 200 ? '…' : '';
    return `${words} words — ${preview}${suffix}`;
  }

  // BlogOutput: full_draft + word_count
  const fullDraft = asString(rec.full_draft);
  const wordCount = asNumber(rec.word_count);
  if (fullDraft) {
    const words = wordCount ?? fullDraft.split(/\s+/).filter(Boolean).length;
    const preview = fullDraft.slice(0, 200);
    const suffix = fullDraft.length > 200 ? '…' : '';
    return `${words} words — ${preview}${suffix}`;
  }

  // Draftless production (multi-track tracks without content yet)
  const draftTitle = asString(rec.draftTitle);
  if (draftTitle) return draftTitle;

  return 'Production complete';
}

/**
 * Review — "Score: X — {verdict}"
 * outcomeJson shape: { score?: number, qualityTier?: string, verdict?: string }
 */
export function summarizeReview(outcomeJson: unknown): string {
  const rec = asRecord(outcomeJson);
  if (!rec) return 'No review data';

  const score = asNumber(rec.score);
  const verdict = asString(rec.verdict) || asString(rec.overall_verdict);
  const qualityTier = asString(rec.qualityTier) || asString(rec.quality_tier);

  const parts: string[] = [];
  if (score !== null) parts.push(`Score: ${score}`);
  if (qualityTier) parts.push(qualityTier);
  if (verdict) parts.push(verdict);

  if (parts.length === 0) return 'Review complete';
  return parts.join(' — ');
}

/**
 * Assets — "N images — first thumbnail URL"
 * outcomeJson shape: { assetIds?: string[], featuredImageUrl?: string }
 */
export function summarizeAssets(outcomeJson: unknown): string {
  const rec = asRecord(outcomeJson);
  if (!rec) return 'No assets data';

  if (rec.skipped === true) return 'Assets skipped';

  const assetIds = asArray(rec.assetIds);
  const featuredImageUrl = asString(rec.featuredImageUrl);
  const count = assetIds.length;

  if (count === 0 && !featuredImageUrl) return 'No assets generated';

  const countPart = count === 1 ? '1 image' : `${count} images`;
  if (featuredImageUrl) {
    return `${countPart} — ${featuredImageUrl}`;
  }
  return countPart;
}

/**
 * Preview — preview URL
 * outcomeJson shape: { composedHtml?: string, seoOverrides?: { title, slug } }
 * The preview stage builds composed HTML + SEO meta; no external URL at this stage.
 */
export function summarizePreview(outcomeJson: unknown): string {
  const rec = asRecord(outcomeJson);
  if (!rec) return 'No preview data';

  if (rec.skipped === true || rec.autoDerived === true) return 'Preview auto-derived';

  const seoOverrides = asRecord(rec.seoOverrides);
  const slug = seoOverrides ? asString(seoOverrides.slug) : '';
  const title = seoOverrides ? asString(seoOverrides.title) : '';

  if (slug) return `/${slug}`;
  if (title) return title;
  if (rec.composedHtml) return 'Preview ready';
  return 'Preview complete';
}

/**
 * Publish — "{status}: {wordpress URL}"
 * outcomeJson shape: { wordpressPostId?: number, publishedUrl?: string }
 * Also handles PublishPanel result: { status?: string }
 */
export function summarizePublish(outcomeJson: unknown): string {
  const rec = asRecord(outcomeJson);
  if (!rec) return 'No publish data';

  const publishedUrl = asString(rec.publishedUrl);
  const status = asString(rec.status) || 'published';
  const wordpressPostId = asNumber(rec.wordpressPostId);

  if (publishedUrl) {
    return `${status}: ${publishedUrl}`;
  }
  if (wordpressPostId !== null) {
    return `${status}: post #${wordpressPostId}`;
  }
  return `${status}`;
}

// ─── Stage dispatcher ──────────────────────────────────────────────────────────

export type OverviewStage =
  | 'brainstorm'
  | 'research'
  | 'canonical'
  | 'production'
  | 'review'
  | 'assets'
  | 'preview'
  | 'publish';

const STAGE_FORMATTERS: Record<OverviewStage, (outcomeJson: unknown) => string> = {
  brainstorm: summarizeBrainstorm,
  research: summarizeResearch,
  canonical: summarizeCanonical,
  production: summarizeProduction,
  review: summarizeReview,
  assets: summarizeAssets,
  preview: summarizePreview,
  publish: summarizePublish,
};

/**
 * Dispatch to the correct formatter by stage name.
 * Falls back gracefully if stage is unknown.
 */
export function summarizeStage(stage: string, outcomeJson: unknown): string {
  const formatter = STAGE_FORMATTERS[stage as OverviewStage];
  if (!formatter) return `${stage} complete`;
  return formatter(outcomeJson);
}
