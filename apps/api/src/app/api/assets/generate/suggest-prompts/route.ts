/**
 * POST /api/assets/generate/suggest-prompts
 * Returns template-based prompt suggestions for a given role/context.
 * Pure function — no AI call, fast response.
 */

import { NextRequest, NextResponse } from "next/server";
import { suggestPromptsRequestSchema } from "@brighttale/shared/schemas/imageGeneration";
import {
  generateBlogFeaturedImagePrompt,
  generateBlogSectionImagePrompt,
  generateVideoThumbnailPrompt,
  generateVideoChapterImagePrompt,
  generateStandalonePrompt,
  extractAgentImagePrompt,
} from "@/lib/ai/promptGenerators";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = suggestPromptsRequestSchema.parse(body);

    const suggestions: string[] = [];

    // If agent already generated a prompt for this role, include it first
    const agentPrompt = extractAgentImagePrompt(validated.agent_image_prompts, validated.role);
    if (agentPrompt) {
      suggestions.push(agentPrompt);
    }

    const { content_type, role, title = "", outline, chapters, thumbnail } = validated;

    if (content_type === "blog") {
      if (role === "featured") {
        if (!agentPrompt) {
          suggestions.push(generateBlogFeaturedImagePrompt(title, undefined, "professional"));
        }
        suggestions.push(generateBlogFeaturedImagePrompt(title, undefined, "casual"));
      } else {
        const sectionMatch = role.match(/^section_(\d+)$/);
        if (sectionMatch) {
          const idx = parseInt(sectionMatch[1], 10) - 1;
          const section = outline?.[idx];
          if (section) {
            if (!agentPrompt) {
              suggestions.push(generateBlogSectionImagePrompt(section.h2, section.key_points));
            }
            suggestions.push(generateBlogSectionImagePrompt(section.h2));
          }
        }
      }
    }

    if (content_type === "video") {
      if (role === "thumbnail_option_1") {
        if (!agentPrompt) {
          suggestions.push(
            generateVideoThumbnailPrompt(title, thumbnail?.visual_concept, thumbnail?.emotion),
          );
        }
        suggestions.push(generateVideoThumbnailPrompt(title, "dramatic close-up", "curiosity"));
      }
      if (role === "thumbnail_option_2") {
        if (!agentPrompt) {
          suggestions.push(
            generateVideoThumbnailPrompt(title, thumbnail?.visual_concept, "intrigue"),
          );
        }
        suggestions.push(generateVideoThumbnailPrompt(title, "wide establishing shot", "shock"));
      }
      const chapterMatch = role.match(/^chapter_(\d+)$/);
      if (chapterMatch) {
        const idx = parseInt(chapterMatch[1], 10) - 1;
        const chapter = chapters?.[idx];
        if (chapter) {
          if (!agentPrompt) {
            suggestions.push(generateVideoChapterImagePrompt(chapter.title));
          }
          suggestions.push(
            `Cinematic still for "${chapter.title}". Natural lighting, documentary style, visually rich.`,
          );
        }
      }
    }

    if (content_type === "standalone") {
      suggestions.push(generateStandalonePrompt(title || "abstract concept", "editorial_photo"));
      suggestions.push(generateStandalonePrompt(title || "abstract concept", "digital_illustration"));
      suggestions.push(generateStandalonePrompt(title || "abstract concept", "minimalist"));
    }

    // Always provide at least one generic fallback
    if (suggestions.length === 0) {
      suggestions.push(
        `Professional photograph related to "${title || role}". Clean composition, natural lighting, high quality, no text.`,
      );
    }

    // Deduplicate, keep max 3
    const unique = [...new Set(suggestions)].slice(0, 3);

    return NextResponse.json({ suggestions: unique });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate suggestions";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
