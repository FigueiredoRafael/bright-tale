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

// ─── Rich (structured) formatters — for overview summary cards ────────────────

export interface RichStageSummary {
  title: string;
  lines: string[];
}

/** Brainstorm rich: idea title + audience + angle + verdict */
function summarizeBrainstormRich(outcomeJson: unknown): RichStageSummary {
  const rec = asRecord(outcomeJson);
  if (!rec) return { title: 'Brainstorm', lines: ['No data'] };
  const lines: string[] = [];
  const ideaTitle = asString(rec.ideaTitle);
  const audience = asString(rec.audience) || asString(rec.target_audience);
  const angle = asString(rec.angle) || asString(rec.coreTension) || asString(rec.ideaCoreTension);
  const format = asString(rec.format);
  const verdict = asString(rec.ideaVerdict) || asString(rec.verdict);
  if (ideaTitle) lines.push(`Idea: ${ideaTitle}`);
  if (audience) lines.push(`Audience: ${audience}`);
  if (angle) lines.push(`Angle: ${angle}`);
  if (format) lines.push(`Format: ${format}`);
  if (verdict) lines.push(`Verdict: ${verdict}`);
  if (lines.length === 0) lines.push('Brainstorm complete');
  return { title: 'Brainstorm', lines };
}

/** Research rich: approved count + avg confidence + top confidence cards */
function summarizeResearchRich(outcomeJson: unknown): RichStageSummary {
  const rec = asRecord(outcomeJson);
  if (!rec) return { title: 'Research', lines: ['No data'] };
  const lines: string[] = [];
  const count = asNumber(rec.approvedCardsCount);
  const avg = asNumber(rec.avgConfidence) ?? asNumber(rec.confidence_score);
  const level = asString(rec.researchLevel) || asString(rec.research_level);
  if (count !== null) lines.push(count === 1 ? '1 card approved' : `${count} cards approved`);
  if (avg !== null) lines.push(`Avg confidence: ${avg}`);
  if (level) lines.push(`Level: ${level}`);
  const confidenceCards = asArray(rec.confidenceCards);
  if (confidenceCards.length > 0) {
    const tops = confidenceCards
      .slice(0, 3)
      .map((card) => {
        const cardRec = asRecord(card);
        if (!cardRec) return '';
        const title = asString(cardRec.title);
        const confidence = asNumber(cardRec.confidence);
        if (!title) return '';
        return confidence !== null ? `${title} (${confidence})` : title;
      })
      .filter(Boolean);
    if (tops.length > 0) lines.push(`Top cards: ${tops.join('; ')}`);
  }
  if (lines.length === 0) lines.push('Research complete');
  return { title: 'Research', lines };
}

/** Canonical rich: thesis + persona + first argument chain claims */
function summarizeCanonicalRich(outcomeJson: unknown): RichStageSummary {
  const rec = asRecord(outcomeJson);
  if (!rec) return { title: 'Canonical', lines: ['No data'] };
  const lines: string[] = [];
  const draftTitle = asString(rec.draftTitle);
  const thesis = asString(rec.thesis);
  if (draftTitle) lines.push(`Title: ${draftTitle}`);
  if (thesis) lines.push(`Thesis: ${thesis}`);
  const persona = asRecord(rec.persona);
  if (persona) {
    const name = asString(persona.name);
    const niche = asString(persona.niche);
    const voice = asString(persona.voice);
    if (name) lines.push(`Persona: ${name}${niche ? ` (${niche})` : ''}`);
    if (voice) lines.push(`Voice: ${voice}`);
  }
  const argumentChain = asArray(rec.argument_chain);
  if (argumentChain.length > 0) {
    const claims = argumentChain
      .slice(0, 3)
      .map((step) => asString(asRecord(step)?.claim))
      .filter(Boolean);
    if (claims.length > 0) lines.push(`Arguments: ${claims.join(' → ')}`);
  }
  if (lines.length === 0) lines.push('Canonical core complete');
  return { title: 'Canonical', lines };
}

/** Production rich: word count + headings + first preview */
function summarizeProductionRich(outcomeJson: unknown): RichStageSummary {
  const rec = asRecord(outcomeJson);
  if (!rec) return { title: 'Production', lines: ['No data'] };
  const lines: string[] = [];
  const draftTitle = asString(rec.draftTitle);
  if (draftTitle) lines.push(`Title: ${draftTitle}`);
  const wordCount = asNumber(rec.wordCount) ?? asNumber(rec.word_count);
  if (wordCount !== null) lines.push(`Words: ${wordCount}`);
  const headings = asArray(rec.headings);
  if (headings.length > 0) {
    const heads = headings.slice(0, 4).map(asString).filter(Boolean);
    if (heads.length > 0) lines.push(`Headings: ${heads.join(' • ')}`);
  }
  const draftContent = asString(rec.draftContent) || asString(rec.full_draft);
  if (draftContent && lines.length < 4) {
    const preview = draftContent.slice(0, 140);
    const suffix = draftContent.length > 140 ? '…' : '';
    lines.push(`Preview: ${preview}${suffix}`);
  }
  if (lines.length === 0) lines.push('Production complete');
  return { title: 'Production', lines };
}

/** Review rich: score + verdict + quality tier + top issue */
function summarizeReviewRich(outcomeJson: unknown): RichStageSummary {
  const rec = asRecord(outcomeJson);
  if (!rec) return { title: 'Review', lines: ['No data'] };
  const lines: string[] = [];
  const score = asNumber(rec.score);
  const verdict = asString(rec.verdict) || asString(rec.overall_verdict);
  const qualityTier = asString(rec.qualityTier) || asString(rec.quality_tier);
  const topIssue = asString(rec.topIssue) || asString(rec.top_issue);
  if (score !== null) lines.push(`Score: ${score}`);
  if (verdict) lines.push(`Verdict: ${verdict}`);
  if (qualityTier) lines.push(`Quality: ${qualityTier}`);
  if (topIssue) lines.push(`Top issue: ${topIssue}`);
  if (lines.length === 0) lines.push('Review complete');
  return { title: 'Review', lines };
}

/** Assets rich: count + featured image */
function summarizeAssetsRich(outcomeJson: unknown): RichStageSummary {
  const rec = asRecord(outcomeJson);
  if (!rec) return { title: 'Assets', lines: ['No data'] };
  if (rec.skipped === true) return { title: 'Assets', lines: ['Skipped'] };
  const lines: string[] = [];
  const assetIds = asArray(rec.assetIds);
  const featured = asString(rec.featuredImageUrl);
  if (assetIds.length > 0) lines.push(`${assetIds.length} image${assetIds.length === 1 ? '' : 's'}`);
  if (featured) lines.push(`Featured: ${featured}`);
  if (lines.length === 0) lines.push('Assets complete');
  return { title: 'Assets', lines };
}

/** Preview rich: slug + title or auto-derived */
function summarizePreviewRich(outcomeJson: unknown): RichStageSummary {
  const rec = asRecord(outcomeJson);
  if (!rec) return { title: 'Preview', lines: ['No data'] };
  if (rec.skipped === true || rec.autoDerived === true) {
    return { title: 'Preview', lines: ['Auto-derived from canonical'] };
  }
  const lines: string[] = [];
  const seoOverrides = asRecord(rec.seoOverrides);
  if (seoOverrides) {
    const title = asString(seoOverrides.title);
    const slug = asString(seoOverrides.slug);
    const metaDescription = asString(seoOverrides.metaDescription);
    if (title) lines.push(`Title: ${title}`);
    if (slug) lines.push(`Slug: /${slug}`);
    if (metaDescription) lines.push(`Meta: ${metaDescription}`);
  }
  if (lines.length === 0) lines.push('Preview complete');
  return { title: 'Preview', lines };
}

/** Publish rich: status + URL + post id */
function summarizePublishRich(outcomeJson: unknown): RichStageSummary {
  const rec = asRecord(outcomeJson);
  if (!rec) return { title: 'Publish', lines: ['No data'] };
  const lines: string[] = [];
  const status = asString(rec.status) || 'published';
  const publishedUrl = asString(rec.publishedUrl);
  const wordpressPostId = asNumber(rec.wordpressPostId);
  lines.push(`Status: ${status}`);
  if (publishedUrl) lines.push(`URL: ${publishedUrl}`);
  if (wordpressPostId !== null) lines.push(`Post #${wordpressPostId}`);
  return { title: 'Publish', lines };
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

const STAGE_FORMATTERS_RICH: Record<OverviewStage, (outcomeJson: unknown) => RichStageSummary> = {
  brainstorm: summarizeBrainstormRich,
  research: summarizeResearchRich,
  canonical: summarizeCanonicalRich,
  production: summarizeProductionRich,
  review: summarizeReviewRich,
  assets: summarizeAssetsRich,
  preview: summarizePreviewRich,
  publish: summarizePublishRich,
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

/**
 * Structured per-stage summary for the Overview's persistent summary cards.
 * Returns { title, lines } so the card can render multi-line bullet content.
 */
export function summarizeStageRich(stage: string, outcomeJson: unknown): RichStageSummary {
  const formatter = STAGE_FORMATTERS_RICH[stage as OverviewStage];
  if (!formatter) return { title: stage, lines: [`${stage} complete`] };
  return formatter(outcomeJson);
}
