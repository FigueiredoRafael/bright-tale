/**
 * Video schema conformance test — Module 11 (PRD #240 Fix 2 lock-in).
 *
 * Parses the video input schema block from agent-4-review.md and asserts that
 * every field name under `production.video` is either:
 *   (a) present as a top-level or nested property on VideoOutput, OR
 *   (b) documented as a derived field with an inline comment in agents.ts
 *
 * This test fails CI if a future edit to either side introduces a mismatch
 * between what the reviewer expects and what the producer emits.
 *
 * Prior art: packages/shared/src/__tests__/stage-run-types.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extracts the JSON block following the `"video":` key inside the
 * BC_REVIEW_INPUT schema in agent-4-review.md. We parse the JSON to get the
 * actual field names rather than regex-matching the file text, which would
 * be brittle against whitespace changes.
 */
function extractReviewerVideoSchema(agentMdPath: string): Record<string, unknown> {
  const content = readFileSync(agentMdPath, 'utf-8');

  // Find the BC_REVIEW_INPUT JSON block (between the first ```json fence
  // inside the "## Input Schema" section and its closing fence).
  const inputSchemaMatch = content.match(/## Input Schema[\s\S]*?```json\n([\s\S]*?)```/);
  if (!inputSchemaMatch) {
    throw new Error('agent-4-review.md: could not locate ## Input Schema JSON block');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(inputSchemaMatch[1]);
  } catch (e) {
    throw new Error(`agent-4-review.md: JSON parse error in Input Schema block: ${String(e)}`);
  }

  const production = parsed.production as Record<string, unknown> | undefined;
  if (!production) {
    throw new Error('agent-4-review.md: Input Schema has no "production" key');
  }
  const video = production.video as Record<string, unknown> | undefined;
  if (!video) {
    throw new Error('agent-4-review.md: Input Schema production has no "video" key');
  }
  return video;
}

/**
 * Returns the top-level keys of a record. For nested objects (thumbnail,
 * script), we also flatten one level so that `thumbnail.visual_style` is
 * represented as `thumbnail_visual_style` — making it easy to check deep
 * field presence without full structural comparison.
 */
function flatKeys(obj: Record<string, unknown>, prefix = ''): Set<string> {
  const result = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    result.add(full);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const nested of flatKeys(v as Record<string, unknown>, full)) {
        result.add(nested);
      }
    }
  }
  return result;
}

// ── VideoOutput representative shape ────────────────────────────────────────
//
// We can't introspect TypeScript interfaces at runtime, so we use a
// representative object that mirrors every property of VideoOutput (including
// the new Module 3 additions). This object is validated via TypeScript compile
// at the bottom — if VideoOutput adds/removes a field and this object goes
// out of sync, the typecheck step (not just this test) will fail.
//
// Nested optional fields are included with placeholder values so flatKeys()
// can discover them.
const VIDEO_OUTPUT_REPRESENTATIVE: import('../agents').VideoOutput = {
  title_options: [''],
  thumbnail: {
    visual_concept: '',
    visual_style: '',         // Module 3 addition — reviewer name
    text_overlay: '',
    emotion: 'curiosity',
    why_it_works: '',
  },
  script: {
    hook: { duration: '', content: '', visual_notes: '' },
    problem: { duration: '', content: '', visual_notes: '' },
    chapters: [],
    outro: { cta: '', end_screen_prompt: '' },
  },
  chapter_count: 0,            // Module 3 addition — derived from script.chapters.length
  teleprompter_script: '',
  editor_script: {},
  video_title: { primary: '' },
  thumbnail_ideas: [],
  pinned_comment: '',
  video_description: '',
  estimated_duration: '',
  lower_thirds: [],
  total_duration_estimate: '',
};

// ── Test suite ──────────────────────────────────────────────────────────────

describe('video-schema-conformance', () => {
  // packages/shared/src/types/__tests__ is 5 levels deep from the monorepo
  // root (bright-tale/). Walk up 5 levels to reach monorepo root.
  const agentMdPath = join(__dirname, '../../../../../agents/agent-4-review.md');

  it('agent-4-review.md Input Schema JSON is valid and contains a video block', () => {
    // Throws if parsing fails — confirms the JSON block is parseable.
    const videoSchema = extractReviewerVideoSchema(agentMdPath);
    expect(typeof videoSchema).toBe('object');
    expect(videoSchema).not.toBeNull();
  });

  it('every top-level field in reviewer video schema exists on VideoOutput', () => {
    const reviewerVideo = extractReviewerVideoSchema(agentMdPath);
    const reviewerTopKeys = Object.keys(reviewerVideo);
    const producerKeys = flatKeys(VIDEO_OUTPUT_REPRESENTATIVE as unknown as Record<string, unknown>);

    const mismatches: string[] = [];
    for (const key of reviewerTopKeys) {
      if (!producerKeys.has(key)) {
        mismatches.push(key);
      }
    }

    expect(mismatches, `Reviewer references fields not on VideoOutput: ${mismatches.join(', ')}`).toHaveLength(0);
  });

  it('reviewer thumbnail sub-fields match VideoOutput thumbnail', () => {
    const reviewerVideo = extractReviewerVideoSchema(agentMdPath);
    const reviewerThumbnail = reviewerVideo.thumbnail as Record<string, unknown> | undefined;
    if (!reviewerThumbnail) return; // no thumbnail key → pass (optional)

    const producerThumbnailKeys = new Set(
      Object.keys(VIDEO_OUTPUT_REPRESENTATIVE.thumbnail ?? {}),
    );

    const mismatches = Object.keys(reviewerThumbnail).filter(
      (k) => !producerThumbnailKeys.has(k),
    );
    expect(mismatches, `Reviewer thumbnail fields not on VideoOutput.thumbnail: ${mismatches.join(', ')}`).toHaveLength(0);
  });

  it('chapter_count is present in both reviewer schema and VideoOutput', () => {
    const reviewerVideo = extractReviewerVideoSchema(agentMdPath);
    // Reviewer side
    expect(reviewerVideo).toHaveProperty('chapter_count');
    // Producer side (VideoOutput representative)
    expect(VIDEO_OUTPUT_REPRESENTATIVE).toHaveProperty('chapter_count');
  });

  it('thumbnail.visual_style is present in reviewer schema', () => {
    const reviewerVideo = extractReviewerVideoSchema(agentMdPath);
    const thumbnail = reviewerVideo.thumbnail as Record<string, unknown> | undefined;
    expect(thumbnail).toBeDefined();
    expect(thumbnail).toHaveProperty('visual_style');
  });

  it('thumbnail.visual_style is present in VideoOutput (Module 3 alignment)', () => {
    expect(VIDEO_OUTPUT_REPRESENTATIVE.thumbnail).toHaveProperty('visual_style');
  });

  it('lower_thirds and editor_script are present in reviewer schema (v0.3 fields)', () => {
    const reviewerVideo = extractReviewerVideoSchema(agentMdPath);
    expect(reviewerVideo).toHaveProperty('lower_thirds');
    expect(reviewerVideo).toHaveProperty('editor_script');
  });
});
