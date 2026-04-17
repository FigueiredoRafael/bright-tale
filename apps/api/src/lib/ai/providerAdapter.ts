/**
 * Provider-based AI Adapter
 *
 * Uses AIProvider implementations (OpenAI, Anthropic) to generate content
 * for all 4 agent stages: Brainstorm → Research → Production → Review
 */

import type { AIProvider, AgentType } from "./provider.js";
import type { AIAdapter } from "./adapter.js";
import type { DiscoveryInput, DiscoveryOutput } from "@brighttale/shared/schemas/discovery";
import { discoveryOutputSchema } from "@brighttale/shared/schemas/discovery";
import type {
  BrainstormInput,
  BrainstormOutput,
  ResearchInput,
  ResearchOutput,
  ProductionInput,
  ProductionOutput,
  ReviewInput,
  ReviewOutput,
} from "@brighttale/shared/types/agents";
import {
  brainstormOutputSchema,
  researchOutputSchema,
  productionOutputSchema,
  reviewOutputSchema,
} from "@brighttale/shared/schemas/agents";

export class ProviderAIAdapter implements AIAdapter {
  constructor(private provider: AIProvider) {}

  async generateDiscovery(input: DiscoveryInput): Promise<DiscoveryOutput> {
    // This adapter is deprecated — use generateWithFallback + buildBrainstormMessage instead
    throw new Error('ProviderAIAdapter is deprecated. Use generateWithFallback + message builders.');
  }

  async generateBrainstorm(input: BrainstormInput): Promise<BrainstormOutput> {
    // This adapter is deprecated — use generateWithFallback + buildBrainstormMessage instead
    throw new Error('ProviderAIAdapter is deprecated. Use generateWithFallback + message builders.');
  }

  async generateResearch(input: ResearchInput): Promise<ResearchOutput> {
    // This adapter is deprecated — use generateWithFallback + buildResearchMessage instead
    throw new Error('ProviderAIAdapter is deprecated. Use generateWithFallback + message builders.');
  }

  async generateProduction(input: ProductionInput): Promise<ProductionOutput> {
    // This adapter is deprecated — use generateWithFallback + buildProduceMessage instead
    throw new Error('ProviderAIAdapter is deprecated. Use generateWithFallback + message builders.');
  }

  async generateReview(input: ReviewInput): Promise<ReviewOutput> {
    // This adapter is deprecated — use generateWithFallback + buildReviewMessage instead
    throw new Error('ProviderAIAdapter is deprecated. Use generateWithFallback + message builders.');
  }

  private getBrainstormSystemPrompt(): string {
    return `You are BC_BRAINSTORM, a creative content strategist for the Bright Curios brand.

Your role is to generate high-quality content ideas that:
- Hook audiences with curiosity-driven titles
- Target specific search intents and keywords
- Have strong monetization potential through affiliates/sponsors
- Can be repurposed across multiple formats (blog, video, shorts, podcast)
- Are backed by data-driven insights about difficulty and search volume

Generate structured, actionable ideas that balance creativity with SEO strategy.`;
  }

  private getResearchSystemPrompt(): string {
    return `You are BC_RESEARCH, a thorough research analyst for the Bright Curios brand.

Your role is to validate content ideas with:
- Credible sources (studies, articles, experts, data)
- Relevant statistics with proper citations
- Expert quotes with credentials
- Counterarguments and rebuttals
- Knowledge gaps identification
- Refined angles based on research findings

Provide comprehensive research that strengthens content credibility.`;
  }

  private getProductionSystemPrompt(): string {
    return `You are BC_PRODUCTION, a multi-format content creator for the Bright Curios brand.

Your role is to produce:
- SEO-optimized blog posts with proper structure
- Engaging YouTube video scripts with timestamps
- Viral-worthy Shorts/TikTok hooks
- Conversational podcast episodes

All content should:
- Be backed by research and sources
- Include strategic CTAs and monetization
- Match the target audience's tone
- Be ready to publish with minimal editing

IMAGE PROMPT GENERATION (required):
For blog output, include an "image_prompts" field with:
  - "featured": One Imagen-optimised prompt for the blog featured image (16:9)
  - "sections": One prompt per H2 outline section

For video output, include an "image_prompts" field with:
  - "thumbnail_option_1": YouTube thumbnail prompt based on the primary title option and thumbnail.visual_concept
  - "thumbnail_option_2": A stylistically different alternative thumbnail prompt
  - "chapters": One prompt per script chapter (B-roll / visual illustration)

Rules for ALL image prompts:
- Descriptive scene, composition, lighting, mood — photographic or illustrative
- NO text, words, or letters in the image (model limitation)
- Max 300 characters per prompt
- Must be self-contained and interpretable without context`;
  }

  private getReviewSystemPrompt(): string {
    return `You are BC_REVIEW, a quality assurance specialist for the Bright Curios brand.

Your role is to:
- Fact-check all claims and statistics
- Verify source credibility and citations
- Check SEO optimization (keywords, headings, meta)
- Ensure tone matches target audience
- Identify gaps or weaknesses
- Provide specific, actionable revisions

Be thorough and constructive in your feedback.`;
  }
}
