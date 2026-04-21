/**
 * Agent Type Definitions
 * Matches the 4-agent chained workflow contracts:
 * Brainstorm → Research → Production → Review
 */

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 1: BRAINSTORM
// ═══════════════════════════════════════════════════════════════════════════

export interface BrainstormInput {
  performance_context?: {
    recent_winners: string[];
    recent_losers: string[];
  };
  theme: {
    primary: string;
    subthemes: string[];
  };
  goal: "growth" | "engagement" | "monetization" | "authority";
  temporal_mix?: {
    evergreen_pct: number;
    seasonal_pct: number;
    trending_pct: number;
  };
  constraints?: {
    avoid_topics: string[];
    required_formats: string[];
  };
  ideas_requested: number;
}

export interface BrainstormIdea {
  idea_id: string;
  title: string;
  core_tension: string;
  target_audience: string;
  search_intent: "informational" | "commercial" | "navigational" | "mixed";
  primary_keyword: {
    term: string;
    difficulty: "low" | "medium" | "high";
    monthly_volume_estimate: string;
  };
  scroll_stopper: string;
  curiosity_gap: string;
  monetization_hypothesis: {
    affiliate_angle: string;
    product_categories?: string[];
    sponsor_category?: string;
  };
  repurpose_potential: {
    blog_angle: string;
    video_angle: string;
    shorts_hooks: string[];
    podcast_angle: string;
  };
  risk_flags: string[];
  verdict: "viable" | "experimental" | "weak";
  verdict_rationale: string;
}

export interface BrainstormOutput {
  ideas: BrainstormIdea[];
  recommendation: {
    pick: string;
    rationale: string;
  };
}

// Legacy format support (30-day compatibility)
export interface LegacyIdea {
  title: string;
  one_liner?: string;
  core_tension?: string;
  curiosity_hook?: string;
  mrbeast_hook?: string;
  evergreen_rationale?: string;
  affiliate_fit?: string;
  source_credibility?: string;
  difficulty?: string;
  estimated_search_volume?: string;
  monetization_score?: string;
  feasibility_score?: string;
  priority_score?: string;
  target_audience?: string;
  primary_keyword?: {
    keyword?: string;
    term?: string;
    difficulty?: string;
  };
  monetization?: {
    affiliate_angle?: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 2: RESEARCH
// ═══════════════════════════════════════════════════════════════════════════

export interface SelectedIdeaForResearch {
  idea_id: string;
  title: string;
  core_tension: string;
  target_audience: string;
  scroll_stopper: string;
  curiosity_gap: string;
  primary_keyword: {
    term: string;
    difficulty: string;
  };
  monetization_hypothesis: {
    affiliate_angle: string;
  };
}

export interface ResearchInput {
  selected_idea: SelectedIdeaForResearch;
  research_focus: string[];
  depth: "quick" | "standard" | "deep";
}

export interface ResearchSource {
  source_id: string;
  title: string;
  url: string;
  type: "study" | "article" | "expert" | "data" | "book";
  credibility: "low" | "medium" | "high";
  key_insight: string;
  quote_excerpt?: string;
  date_published?: string;
}

export interface ResearchStatistic {
  stat_id: string;
  claim: string;
  figure: string;
  source_id: string;
  context: string;
}

export interface ResearchQuote {
  quote_id: string;
  quote: string;
  author: string;
  credentials: string;
  source_id: string;
}

export interface ResearchCounterargument {
  counter_id: string;
  point: string;
  strength: "weak" | "moderate" | "strong";
  rebuttal: string;
  source_id?: string;
}

export interface ResearchOutput {
  idea_id: string;
  idea_validation: {
    core_claim_verified: boolean;
    evidence_strength: "weak" | "moderate" | "strong";
    confidence_score: number;
    validation_notes: string;
  };
  seo: {
    primary_keyword: string;
    secondary_keywords?: string[];
    search_intent?: "informational" | "commercial" | "navigational" | "mixed";
  };
  sources: ResearchSource[];
  statistics: ResearchStatistic[];
  expert_quotes: ResearchQuote[];
  counterarguments: ResearchCounterargument[];
  knowledge_gaps: string[];
  research_summary: string;
  refined_angle: {
    should_pivot: boolean;
    updated_title: string;
    updated_hook: string;
    angle_notes: string;
    recommendation: "proceed" | "pivot" | "abandon";
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 3: PRODUCTION
// ═══════════════════════════════════════════════════════════════════════════

export interface ProductionInput {
  selected_idea: {
    idea_id: string;
    title: string;
    core_tension: string;
    target_audience: string;
    scroll_stopper: string;
    curiosity_gap: string;
    primary_keyword: string;
    monetization_hypothesis: {
      affiliate_angle: string;
    };
  };
  research: {
    summary: string;
    validation: {
      verified: boolean;
      evidence_strength: string;
    };
    key_sources: Array<{
      title: string;
      url: string;
      key_insight: string;
    }>;
    key_statistics: Array<{
      claim: string;
      figure: string;
      context: string;
    }>;
    expert_quotes: Array<{
      quote: string;
      author: string;
      credentials: string;
    }>;
    counterarguments: Array<{
      point: string;
      rebuttal: string;
    }>;
    /** Unverified topics from research — agent should avoid making claims about these */
    knowledge_gaps: string[];
    /** Angle refinement from research agent — agent should respect pivot recommendations */
    refined_angle?: {
      should_pivot: boolean;
      angle_notes: string;
      recommendation: "proceed" | "pivot" | "abandon";
    };
  };
}

export interface BlogOutput {
  title: string;
  slug: string;
  meta_description: string;
  primary_keyword: string;
  secondary_keywords: string[];
  outline: Array<{
    h2: string;
    key_points: string[];
    word_count_target: number;
  }>;
  full_draft: string;
  affiliate_integration: {
    placement: "intro" | "middle" | "conclusion";
    copy: string;
    product_link_placeholder: string;
    rationale: string;
  };
  internal_links_suggested: Array<{
    topic: string;
    anchor_text: string;
  }>;
  word_count: number;
  /** AI-generated Imagen-optimised prompts for blog images */
  image_prompts?: {
    featured: string;
    sections: Array<{
      heading: string;
      prompt: string;
    }>;
  };
}

export interface VideoScriptSection {
  duration: string;
  content: string;
  visual_notes: string;
  sound_effects?: string;
  background_music?: string;
}

export interface VideoScript {
  hook: VideoScriptSection;
  problem: VideoScriptSection;
  teaser: VideoScriptSection;
  chapters: Array<{
    chapter_number: number;
    title: string;
    duration: string;
    content: string;
    b_roll_suggestions: string[];
    key_stat_or_quote: string;
    sound_effects?: string;
    background_music?: string;
  }>;
  affiliate_segment?: {
    timestamp: string;
    script: string;
    transition_in: string;
    transition_out: string;
    visual_notes: string;
    sound_effects?: string;
    background_music?: string;
  };
  outro?: {
    duration: string;
    recap: string;
    cta: string;
    end_screen_prompt: string;
    sound_effects?: string;
    background_music?: string;
  };
}

export interface VideoOutput {
  title_options: string[];
  thumbnail?: {
    visual_concept: string;
    text_overlay: string;
    emotion: "curiosity" | "shock" | "intrigue";
    why_it_works: string;
  };
  script: VideoScript;
  total_duration_estimate: string;
  /** AI-generated Imagen-optimised prompts for video assets */
  image_prompts?: {
    thumbnail_option_1: string;
    thumbnail_option_2: string;
    chapters: Array<{
      chapter_title: string;
      prompt: string;
    }>;
  };
}

export interface ShortOutput {
  short_number: number;
  title: string;
  hook: string;
  script: string;
  duration: string;
  visual_style: "talking head" | "b-roll" | "text overlay";
  cta: string;
  sound_effects?: string;
  background_music?: string;
}

export interface PodcastOutput {
  episode_title: string;
  episode_description: string;
  intro_hook: string;
  talking_points: Array<{
    point: string;
    notes: string;
  }>;
  personal_angle: string;
  guest_questions: string[];
  outro: string;
  duration_estimate: string;
}

export interface EngagementOutput {
  pinned_comment: string;
  community_post: string;
  twitter_thread: {
    hook_tweet: string;
    thread_outline: string[];
  };
}

export interface ProductionOutput {
  idea_id: string;
  blog: BlogOutput;
  video: VideoOutput;
  shorts: ShortOutput[];
  podcast: PodcastOutput;
  engagement: EngagementOutput;
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 4: REVIEW
// ═══════════════════════════════════════════════════════════════════════════

export interface ReviewInput {
  idea_id: string;
  original_idea: {
    title: string;
    core_tension: string;
    target_audience: string;
  };
  research_validation: {
    verified: boolean;
    evidence_strength: string;
  };
  // Which content types were actually produced and should be reviewed
  content_types_requested: Array<"blog" | "video" | "shorts" | "podcast">;
  production: ProductionOutput;
}

export interface ReviewIssue {
  location: string;
  issue: string;
  suggested_fix: string;
}

export interface ContentReview {
  verdict: "approved" | "revision_required" | "rejected" | "not_requested";
  score: number;
  strengths: string[];
  issues: {
    critical: ReviewIssue[];
    minor: ReviewIssue[];
  };
  notes: string;
}

export interface BlogReview extends ContentReview {
  seo_check: {
    title_optimized: boolean;
    meta_description_optimized: boolean;
    keyword_usage: "good" | "needs_improvement" | "poor";
    readability_score: "easy" | "moderate" | "difficult";
  };
}

export interface VideoReview extends ContentReview {
  hook_effectiveness: "strong" | "moderate" | "weak";
  pacing_notes: string;
  thumbnail_feedback: string;
}

// Podcast review has a flat issues array (different from blog/video)
export interface PodcastReview {
  verdict: "approved" | "revision_required" | "rejected" | "not_requested";
  score: number;
  strengths: string[];
  issues: Array<{ issue: string; suggested_fix: string }>;
  notes: string;
}

export interface ShortReview {
  short_number: number;
  verdict: "approved" | "revision_required" | "rejected" | "not_requested";
  hook_strength: "strong" | "moderate" | "weak";
  notes: string;
}

export interface PublicationPlan {
  ready_to_publish: boolean;
  blog: {
    recommended_publish_date: string;
    publish_time: string;
    final_seo: {
      title: string;
      meta_description: string;
      slug: string;
    };
    internal_links: Array<{ anchor_text: string; target_url: string }>;
    categories: string[];
    tags: string[];
  };
  youtube: {
    recommended_publish_date: string;
    publish_time: string;
    final_title: string;
    description: string;
    tags: string[];
    cards_and_endscreens: Array<{
      type: "card" | "endscreen";
      timestamp: string;
      target: string;
    }>;
    pinned_comment: string;
  };
  shorts: Array<{
    short_number: number;
    publish_date: string;
    publish_time: string;
    platform: "youtube" | "instagram" | "tiktok" | "all";
  }>;
  podcast: {
    recommended_publish_date: string;
    episode_number: string;
  };
  cross_promotion: {
    twitter_thread_date: string;
    community_post_date: string;
    newsletter_mention: string;
  };
}

export interface ReviewOutput {
  idea_id: string;
  overall_verdict: "approved" | "revision_required" | "rejected";
  overall_notes: string;
  blog_review: BlogReview;
  video_review: VideoReview;
  shorts_review: {
    verdict: "approved" | "revision_required" | "rejected" | "not_requested";
    individual_reviews: ShortReview[];
    notes: string;
  };
  podcast_review: PodcastReview;
  engagement_review: {
    pinned_comment_verdict: "approved" | "revision_required" | "not_requested";
    pinned_comment_notes: string;
    community_post_verdict: "approved" | "revision_required" | "not_requested";
    community_post_notes: string;
  };
  publication_plan: PublicationPlan;
  ab_tests: {
    thumbnail_variants: Array<{ variant: string; description: string }>;
    title_variants: Array<{ variant: string; title: string }>;
    testing_notes: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL CORE
// Intermediate narrative contract shared by all format agents.
// Agent 3a generates this; Agents 3b-* consume it.
// ═══════════════════════════════════════════════════════════════════════════

export interface CanonicalCoreArgumentStep {
  step: number;
  claim: string;
  evidence: string;
  source_ids?: string[];
}

export interface CanonicalCoreEmotionalArc {
  opening_emotion: string;
  turning_point: string;
  closing_emotion: string;
}

export interface CanonicalCoreStat {
  stat: string;
  figure: string;
  source_id?: string;
}

export interface CanonicalCoreQuote {
  quote: string;
  author: string;
  credentials?: string;
}

export interface CanonicalCoreAffiliateMoment {
  trigger_context: string;
  product_angle: string;
  cta_primary: string;
}

/** The canonical narrative contract from which all formats are derived */
export interface CanonicalCore {
  idea_id: string;
  thesis: string;
  argument_chain: CanonicalCoreArgumentStep[];
  emotional_arc: CanonicalCoreEmotionalArc;
  key_stats: CanonicalCoreStat[];
  key_quotes?: CanonicalCoreQuote[];
  affiliate_moment?: CanonicalCoreAffiliateMoment;
  cta_subscribe?: string;
  cta_comment_prompt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY TYPES & HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export type StageType =
  | "brainstorm"
  | "research"
  | "production"
  | "review"
  | "publish";

export type StageInput =
  | BrainstormInput
  | ResearchInput
  | ProductionInput
  | ReviewInput;
export type StageOutput =
  | BrainstormOutput
  | ResearchOutput
  | ProductionOutput
  | ReviewOutput;

/**
 * Normalize legacy idea format to new BrainstormIdea format
 */
export function normalizeLegacyIdea(legacy: LegacyIdea): BrainstormIdea {
  return {
    idea_id: `BC-IDEA-${Date.now()}`,
    title: legacy.title,
    core_tension: legacy.core_tension || legacy.one_liner || "",
    target_audience: legacy.target_audience || "",
    search_intent: "informational",
    primary_keyword: {
      term:
        legacy.primary_keyword?.keyword || legacy.primary_keyword?.term || "",
      difficulty:
        (legacy.primary_keyword?.difficulty as "low" | "medium" | "high") ||
        "medium",
      monthly_volume_estimate: legacy.estimated_search_volume || "unknown",
    },
    scroll_stopper: legacy.mrbeast_hook || legacy.curiosity_hook || "",
    curiosity_gap: legacy.curiosity_hook || "",
    monetization_hypothesis: {
      affiliate_angle:
        legacy.monetization?.affiliate_angle || legacy.affiliate_fit || "",
    },
    repurpose_potential: {
      blog_angle: "",
      video_angle: "",
      shorts_hooks: [],
      podcast_angle: "",
    },
    risk_flags: [],
    verdict: "experimental",
    verdict_rationale: legacy.evergreen_rationale || "",
  };
}

/**
 * Check if an idea object is in legacy format
 */
export function isLegacyIdea(idea: unknown): idea is LegacyIdea {
  if (typeof idea !== "object" || idea === null) return false;
  const obj = idea as Record<string, unknown>;
  // Legacy format has one_liner, mrbeast_hook, or curiosity_hook but not scroll_stopper
  return (
    ("one_liner" in obj || "mrbeast_hook" in obj || "curiosity_hook" in obj) &&
    !("scroll_stopper" in obj)
  );
}

/**
 * Map selected BrainstormIdea to ResearchInput.selected_idea
 */
export function mapBrainstormToResearchInput(
  idea: BrainstormIdea,
): SelectedIdeaForResearch {
  return {
    idea_id: idea.idea_id,
    title: idea.title,
    core_tension: idea.core_tension,
    target_audience: idea.target_audience,
    scroll_stopper: idea.scroll_stopper,
    curiosity_gap: idea.curiosity_gap,
    primary_keyword: {
      term: idea.primary_keyword.term,
      difficulty: idea.primary_keyword.difficulty,
    },
    monetization_hypothesis: {
      affiliate_angle: idea.monetization_hypothesis.affiliate_angle,
    },
  };
}

/**
 * Map ResearchOutput to ProductionInput.research
 */
// Maximum items to pass per research category (keeps token count manageable)
const MAX_SOURCES = 5;
const MAX_STATISTICS = 5;
const MAX_QUOTES = 3;
const MAX_COUNTERARGUMENTS = 3;

export function mapResearchToProductionInput(
  research: ResearchOutput,
): ProductionInput["research"] & { seo?: ResearchOutput["seo"] } {
  return {
    summary: research.research_summary,
    validation: {
      verified: research.idea_validation.core_claim_verified,
      evidence_strength: research.idea_validation.evidence_strength,
    },
    key_sources: research.sources.slice(0, MAX_SOURCES).map(s => ({
      title: s.title,
      url: s.url,
      key_insight: s.key_insight,
    })),
    key_statistics: research.statistics.slice(0, MAX_STATISTICS).map(s => ({
      claim: s.claim,
      figure: s.figure,
      context: s.context,
    })),
    expert_quotes: research.expert_quotes.slice(0, MAX_QUOTES).map(q => ({
      quote: q.quote,
      author: q.author,
      credentials: q.credentials,
    })),
    counterarguments: research.counterarguments.slice(0, MAX_COUNTERARGUMENTS).map(c => ({
      point: c.point,
      rebuttal: c.rebuttal,
    })),
    knowledge_gaps: research.knowledge_gaps,
    refined_angle: {
      should_pivot: research.refined_angle.should_pivot,
      angle_notes: research.refined_angle.angle_notes,
      recommendation: research.refined_angle.recommendation,
    },
    seo: research.seo,
  };
}
