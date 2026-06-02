import type { SupabaseClient } from "@supabase/supabase-js";

export interface PlatformSettingsRecord {
  costBlog: number;
  costVideo: number;
  costShorts: number;
  costPodcast: number;
  costCanonicalCore: number;
  costReview: number;
}

const DEFAULTS: PlatformSettingsRecord = {
  costBlog: 200,
  costVideo: 200,
  costShorts: 100,
  costPodcast: 150,
  costCanonicalCore: 80,
  costReview: 20,
};

export async function loadPlatformSettings(
  sb: SupabaseClient,
): Promise<PlatformSettingsRecord> {
  const { data } = await sb
    .from("platform_settings")
    .select(
      "cost_blog, cost_video, cost_shorts, cost_podcast, cost_canonical_core, cost_review",
    )
    .maybeSingle();

  if (!data) return DEFAULTS;

  return {
    costBlog: data.cost_blog ?? DEFAULTS.costBlog,
    costVideo: data.cost_video ?? DEFAULTS.costVideo,
    costShorts: data.cost_shorts ?? DEFAULTS.costShorts,
    costPodcast: data.cost_podcast ?? DEFAULTS.costPodcast,
    costCanonicalCore: data.cost_canonical_core ?? DEFAULTS.costCanonicalCore,
    costReview: data.cost_review ?? DEFAULTS.costReview,
  };
}
