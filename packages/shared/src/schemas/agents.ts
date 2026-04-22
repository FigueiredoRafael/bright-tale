/**
 * Zod Schemas for Agent Workflows
 * Validates YAML output from BC_* agents
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════
// BRAINSTORM SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const brainstormIdeaSchema = z.object({
  idea_id: z.string(),
  title: z.string(),
  core_tension: z.string(),
  target_audience: z.string(),
  search_intent: z.enum([
    "informational",
    "commercial",
    "navigational",
    "mixed",
  ]),
  primary_keyword: z.object({
    term: z.string(),
    difficulty: z.enum(["low", "medium", "high"]),
    monthly_volume_estimate: z.string(),
  }),
  scroll_stopper: z.string(),
  curiosity_gap: z.string(),
  monetization: z.object({
    affiliate_angle: z.string(),
    product_fit: z.string(),
    sponsor_appeal: z.string(),
  }),
  repurpose_potential: z.object({
    blog_angle: z.string(),
    video_angle: z.string(),
    shorts_hooks: z.array(z.string()),
    podcast_angle: z.string(),
  }),
  risk_flags: z.array(z.string()),
  verdict: z.enum(["viable", "experimental", "weak"]),
  verdict_rationale: z.string(),
});

export const brainstormOutputSchema = z.object({
  ideas: z.array(brainstormIdeaSchema),
  recommendation: z.object({
    pick: z.string(),
    rationale: z.string(),
  }),
});

// ═══════════════════════════════════════════════════════════════════════════
// RESEARCH SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const researchSourceSchema = z.object({
  source_id: z.string(),
  title: z.string(),
  url: z.string(),
  type: z.enum(["study", "article", "expert", "data", "book"]),
  credibility: z.enum(["low", "medium", "high"]),
  key_insight: z.string(),
  quote_excerpt: z.string().optional(),
  date_published: z.string().optional(),
});

export const researchStatisticSchema = z.object({
  stat_id: z.string(),
  claim: z.string(),
  figure: z.string(),
  source_id: z.string(),
  context: z.string(),
});

export const researchQuoteSchema = z.object({
  quote_id: z.string(),
  quote: z.string(),
  author: z.string(),
  credentials: z.string(),
  source_id: z.string(),
});

export const researchCounterargumentSchema = z.object({
  counter_id: z.string(),
  point: z.string(),
  strength: z.enum(["weak", "moderate", "strong"]),
  rebuttal: z.string(),
  source_id: z.string().optional(),
});

export const researchOutputSchema = z.object({
  idea_id: z.string(),
  idea_validation: z.object({
    core_claim_verified: z.boolean(),
    evidence_strength: z.enum(["weak", "moderate", "strong"]),
    confidence_score: z.number().min(0).max(100),
    validation_notes: z.string(),
  }),
  seo: z.object({
    primary_keyword: z.string().min(1),
    secondary_keywords: z.array(z.string()).optional(),
    search_intent: z.enum(["informational", "commercial", "navigational", "mixed"]).optional(),
  }),
  sources: z.array(researchSourceSchema),
  statistics: z.array(researchStatisticSchema),
  expert_quotes: z.array(researchQuoteSchema),
  counterarguments: z.array(researchCounterargumentSchema),
  knowledge_gaps: z.array(z.string()),
  research_summary: z.string(),
  refined_angle: z.object({
    should_pivot: z.boolean(),
    updated_title: z.string(),
    updated_hook: z.string(),
    angle_notes: z.string(),
    recommendation: z.enum(["proceed", "pivot", "abandon"]),
  }),
});

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const productionBlogSchema = z.object({
  title: z.string(),
  meta_description: z.string(),
  slug_suggestion: z.string(),
  content_html: z.string(),
  seo_keywords: z.array(z.string()),
  internal_links: z.array(z.string()),
  cta: z.string(),
  cta_placement: z.string(),
  affiliate_placements: z.array(
    z.object({
      product: z.string(),
      context: z.string(),
      anchor_text: z.string(),
    }),
  ),
  word_count: z.number(),
});

const videoScriptSectionSchema = z.object({
  duration: z.string(),
  content: z.string(),
  visual_notes: z.string(),
  sound_effects: z.string().optional(),
  background_music: z.string().optional(),
});

export const productionVideoSchema = z.object({
  title_options: z.array(z.string()),
  thumbnail: z.object({
    visual_concept: z.string(),
    text_overlay: z.string(),
    emotion: z
      .string()
      .transform((val) => val.toLowerCase().trim())
      .pipe(z.enum(["curiosity", "shock", "intrigue"])),
    why_it_works: z.string(),
  }).optional(),
  script: z.object({
    hook: videoScriptSectionSchema,
    problem: videoScriptSectionSchema,
    teaser: videoScriptSectionSchema,
    chapters: z.array(z.object({
      chapter_number: z.number(),
      title: z.string(),
      duration: z.string(),
      content: z.string(),
      b_roll_suggestions: z.array(z.string()),
      key_stat_or_quote: z.string(),
      sound_effects: z.string().optional(),
      background_music: z.string().optional(),
    })),
    affiliate_segment: z.object({
      timestamp: z.string(),
      script: z.string(),
      transition_in: z.string(),
      transition_out: z.string(),
      visual_notes: z.string(),
      sound_effects: z.string().optional(),
      background_music: z.string().optional(),
    }).optional(),
    outro: z.object({
      duration: z.string(),
      recap: z.string(),
      cta: z.string(),
      end_screen_prompt: z.string(),
      sound_effects: z.string().optional(),
      background_music: z.string().optional(),
    }).optional(),
  }).optional(),
  total_duration_estimate: z.string(),
});

export const productionShortsSchema = z.object({
  short_number: z.number(),
  title: z.string(),
  hook: z.string(),
  script: z.string(),
  duration: z.string(),
  visual_style: z
    .string()
    .transform((val) => {
      const normalized = val.toLowerCase().replace(/_/g, " ").trim();
      if (normalized === "talking head" || normalized === "talking-head") return "talking head";
      if (normalized === "b-roll" || normalized === "b roll" || normalized === "broll") return "b-roll";
      if (normalized === "text overlay" || normalized === "text-overlay") return "text overlay";
      return val;
    })
    .pipe(z.enum(["talking head", "b-roll", "text overlay"])),
  cta: z.string(),
  sound_effects: z.string().optional(),
  background_music: z.string().optional(),
});

export const productionPodcastSchema = z.object({
  episode_title: z.string(),
  intro: z.string(),
  script: z.string(),
  key_talking_points: z.array(z.string()),
  timestamps: z.array(
    z.object({
      time: z.string(),
      topic: z.string(),
    }),
  ),
  outro: z.string(),
  show_notes: z.string(),
  duration_estimate: z.string(),
});

export const productionOutputSchema = z.object({
  idea_id: z.string(),
  formats: z.object({
    blog: productionBlogSchema.optional(),
    video: productionVideoSchema.optional(),
    shorts: z.array(productionShortsSchema).optional(),
    podcast: productionPodcastSchema.optional(),
  }),
  cross_promotion_strategy: z.string().optional(),
  repurpose_notes: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// REVIEW SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const reviewIssueSchema = z.object({
  issue_id: z.string(),
  severity: z.enum(["critical", "major", "minor"]),
  category: z.enum(["factual", "seo", "tone", "structure", "legal", "other"]),
  description: z.string(),
  location: z.string(),
  suggested_fix: z.string(),
});

export const reviewSeoCheckSchema = z.object({
  keyword_density: z.string(),
  headings_optimized: z.boolean(),
  meta_complete: z.boolean(),
  internal_links: z.number(),
  readability_score: z.string(),
  improvements: z.array(z.string()),
});

export const reviewOutputSchema = z.object({
  idea_id: z.string(),
  format_reviewed: z.enum(["blog", "video", "shorts", "podcast"]),
  overall_score: z.number().min(0).max(100),
  issues: z.array(reviewIssueSchema),
  seo_check: reviewSeoCheckSchema.optional(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  revision_priority: z.enum(["critical", "recommended", "optional"]),
  approval_status: z.enum(["approved", "needs_revision", "rejected"]),
  reviewer_notes: z.string(),
});
