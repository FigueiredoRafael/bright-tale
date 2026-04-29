/**
 * derivePreview — pure helper that derives publication-plan metadata from
 * review feedback JSON + the list of selected content assets.
 *
 * Extracted from PreviewEngine.tsx so that auto-pilot (Task 2.6) can call it
 * without mounting the engine UI.
 */

export interface DerivedPreview {
  categories: string[];
  tags: string[];
  seo: Record<string, string>;
  featuredImageUrl: string | null;
  publishDate?: string;
}

/**
 * Derive publication metadata from review feedback + asset list.
 *
 * @param feedbackJson  - The `review_feedback_json` blob from the DB (or null)
 * @param assets        - Array of content assets (each may carry a `role` and `source_url`)
 */
export function derivePreview(
  feedbackJson: Record<string, unknown> | null,
  assets: Array<{ id: string; role?: string | null; source_url?: string | null; webp_url?: string | null }>,
): DerivedPreview {
  const { categories, tags, seo, publishDate } = extractPublicationPlan(feedbackJson);

  const featuredAsset = assets.find((a) => a.role === 'featured_image');
  const featuredImageUrl =
    featuredAsset?.webp_url ?? featuredAsset?.source_url ?? null;

  return { categories, tags, seo, featuredImageUrl, publishDate };
}

// ---------------------------------------------------------------------------
// Internal: publication-plan extraction (was inline in PreviewEngine.tsx)
// ---------------------------------------------------------------------------

function extractPublicationPlan(
  feedbackJson: Record<string, unknown> | null,
): { categories: string[]; tags: string[]; seo: Record<string, string>; publishDate?: string } {
  const empty = { categories: [] as string[], tags: [] as string[], seo: {} as Record<string, string> };
  if (!feedbackJson || typeof feedbackJson !== 'object') return empty;

  // Unwrap BC_REVIEW_OUTPUT wrapper if present
  const root = (feedbackJson.BC_REVIEW_OUTPUT as Record<string, unknown>) ?? feedbackJson;

  // publication_plan lives at root level or inside blog_review (AI varies)
  const blogReview = (root.blog_review ?? root.blog) as Record<string, unknown> | undefined;
  const pubPlan = (root.publication_plan ?? blogReview?.publication_plan) as Record<string, unknown> | undefined;

  // blog object may be inside publication_plan, or fields may be directly on publication_plan
  const blog = (pubPlan?.blog ?? pubPlan) as Record<string, unknown> | undefined;

  const categories = (
    (blog?.categories as string[]) ??
    (pubPlan?.categories as string[]) ??
    []
  );
  const tags = (
    (blog?.tags as string[]) ??
    (pubPlan?.tags as string[]) ??
    []
  );

  // SEO can be under final_seo, seo, or directly on blog/pubPlan
  const seo: Record<string, string> = (
    (blog?.final_seo as Record<string, string>) ??
    (blog?.seo as Record<string, string>) ??
    (pubPlan?.final_seo as Record<string, string>) ??
    {}
  );

  // If seo object is empty but individual fields exist at blog level, collect them
  if (!seo.title && !seo.slug && !seo.meta_description) {
    const src = blog ?? pubPlan;
    if (src) {
      if (src.title && typeof src.title === 'string') seo.title = src.title;
      if (src.slug && typeof src.slug === 'string') seo.slug = src.slug;
      const metaDesc = (src.meta_description ?? src.metaDescription) as string | undefined;
      if (metaDesc) seo.meta_description = metaDesc;
    }
  }

  const publishDate = (
    (blog?.recommended_publish_date as string) ??
    (pubPlan?.recommended_publish_date as string) ??
    undefined
  );

  return { categories, tags, seo, publishDate };
}
