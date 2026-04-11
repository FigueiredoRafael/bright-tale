/**
 * Image Prompt Generator Utilities
 *
 * Pure template functions — no AI calls.
 * Generates Imagen-optimised prompts from content metadata.
 *
 * Rules for Imagen prompts:
 *  - Descriptive scene/composition/lighting/mood
 *  - NO text or words in the image (Imagen limitation)
 *  - Under 300 characters per prompt
 *  - Aspect ratio hint in the prompt context (handled via API param, not text)
 */

import type { AgentImagePrompts } from '@brighttale/shared/schemas/imageGeneration';

export function generateBlogFeaturedImagePrompt(
  title: string,
  targetAudience?: string,
  tone?: string,
): string {
  const audienceHint = targetAudience ? ` appealing to ${targetAudience}` : "";
  const toneHint = tone === "casual" ? "warm, approachable" : "professional, editorial";
  return (
    `${toneHint} hero photograph for a blog article titled "${title}"${audienceHint}. ` +
    `Cinematic lighting, shallow depth of field, modern composition, high contrast, vibrant colors.`
  ).slice(0, 300);
}

export function generateBlogSectionImagePrompt(
  heading: string,
  keyPoints?: string[],
): string {
  const context = keyPoints?.length ? ` illustrating ${keyPoints.slice(0, 2).join(" and ")}` : "";
  return (
    `Editorial photograph for blog section "${heading}"${context}. ` +
    `Clean composition, natural lighting, conceptual imagery, visually engaging.`
  ).slice(0, 300);
}

export function generateVideoThumbnailPrompt(
  titleOption: string,
  visualConcept?: string,
  emotion?: "curiosity" | "shock" | "intrigue" | string,
): string {
  const emotionMap: Record<string, string> = {
    curiosity: "wide-eyed wonder, leaning forward",
    shock: "jaw-dropping surprise, dramatic expression",
    intrigue: "mysterious, shadowy, compelling",
  };
  const emotionDesc = emotion ? emotionMap[emotion] ?? emotion : "engaging, expressive";
  const conceptHint = visualConcept ? ` ${visualConcept}.` : ".";
  return (
    `YouTube thumbnail concept for "${titleOption}"${conceptHint} ` +
    `Emotion: ${emotionDesc}. Bold composition, high contrast, vivid colors, no text overlay.`
  ).slice(0, 300);
}

export function generateVideoChapterImagePrompt(chapterTitle: string): string {
  return (
    `B-roll visual for video chapter "${chapterTitle}". ` +
    `Cinematic, documentary style, illustrative of the topic, natural lighting, clean composition.`
  ).slice(0, 300);
}

export function generateStandalonePrompt(
  theme: string,
  style: "editorial_photo" | "digital_illustration" | "minimalist" | "bold_graphic" = "editorial_photo",
  mood?: string,
): string {
  const styleDesc: Record<string, string> = {
    editorial_photo: "professional editorial photography, natural lighting, high detail",
    digital_illustration: "clean digital illustration, flat design, vibrant palette",
    minimalist: "minimalist composition, lots of whitespace, simple shapes, muted tones",
    bold_graphic: "bold graphic design, strong geometry, vivid contrasts, dynamic",
  };
  const moodHint = mood ? ` Mood: ${mood}.` : "";
  return (
    `${styleDesc[style]}. Subject: ${theme}.${moodHint} High quality, visually striking, no text.`
  ).slice(0, 300);
}

/**
 * Extracts an agent-generated image prompt for a specific role
 * from the image_prompts object returned by the production agent.
 */
export function extractAgentImagePrompt(
  imagePrompts: AgentImagePrompts | undefined,
  role: string,
): string | undefined {
  if (!imagePrompts) return undefined;

  if (role === "featured") return imagePrompts.featured;
  if (role === "thumbnail_option_1") return imagePrompts.thumbnail_option_1;
  if (role === "thumbnail_option_2") return imagePrompts.thumbnail_option_2;

  const sectionMatch = role.match(/^section_(\d+)$/);
  if (sectionMatch) {
    const idx = parseInt(sectionMatch[1], 10) - 1;
    return imagePrompts.sections?.[idx]?.prompt;
  }

  const chapterMatch = role.match(/^chapter_(\d+)$/);
  if (chapterMatch) {
    const idx = parseInt(chapterMatch[1], 10) - 1;
    return imagePrompts.chapters?.[idx]?.prompt;
  }

  return undefined;
}
