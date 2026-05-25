import type { RubricCriterion } from './types.js';

/**
 * Video rubric — 10 criteria, 10 points each = 100 max. Mirrors the blog
 * rubric shape so the same Σ(pass ? weight : 0) scorer applies. Criteria
 * are anchored to the BC_REVIEW_INPUT.production.video schema fields the
 * reviewer actually sees in its prompt.
 *
 * Keys are persisted in review_feedback_json.video_review.rubric_evaluation
 * — keep them snake_case and stable across deploys.
 */
export const VIDEO_CRITERIA: RubricCriterion[] = [
  {
    key: 'has_strong_hook',
    title: 'Opening hook grabs attention in the first 5 seconds',
    description:
      'Verify script.hook delivers a scroll-stopping opening within roughly 5 seconds of stated duration.',
    passWhen:
      'script.hook.duration is ≤ 8 seconds AND script.hook.content uses any anchored device: a direct question, a concrete stat, a contrarian claim, a vivid scenario, or an explicit stakes-naming statement.',
    failExamples: [
      'Hook is a 20-second channel intro with no payload.',
      'Hook opens with vague positioning ("Today we\'ll talk about...") and no stakes.',
    ],
    weight: 10,
  },
  {
    key: 'problem_section_present',
    title: 'Problem section names the pain the video resolves',
    description:
      'Verify script.problem identifies the audience pain explicitly so the rest of the video has stakes.',
    passWhen:
      'script.problem.content names the target viewer\'s pain or the contrarian gap the video closes, in concrete (not generic) terms.',
    failExamples: [
      'Problem section is missing.',
      'Problem section restates the title without identifying a specific pain.',
    ],
    weight: 10,
  },
  {
    key: 'chapters_align_to_canonical',
    title: 'Chapter count matches canonical argument chain',
    description:
      'Verify chapter_count equals canonical_core.argument_chain length and chapter titles paraphrase each step in order.',
    passWhen:
      'chapter_count equals the number of canonical_core.argument_chain steps AND each script.chapters[i].title paraphrases the i-th argument step.',
    failExamples: [
      'Canonical has 5 argument steps but script has 2 chapters.',
      'Chapter order shuffles the argument chain.',
    ],
    weight: 10,
  },
  {
    key: 'each_chapter_has_substance',
    title: 'Every chapter has duration, content, and supporting material',
    description:
      'Verify each chapter is fleshed out enough for the producer to film from.',
    passWhen:
      'For every entry in script.chapters: duration is non-empty AND content has ≥ 50 words AND at least one of b_roll_suggestions or key_stat_or_quote is non-empty.',
    failExamples: [
      'Chapter 3 has empty content.',
      'Chapter 4 has content but no b-roll suggestions and no key stat or quote.',
    ],
    weight: 10,
  },
  {
    key: 'outro_has_cta',
    title: 'Outro contains an explicit CTA',
    description:
      'Verify script.outro names a concrete next action for the viewer.',
    passWhen:
      'script.outro.cta is non-empty AND uses an imperative CTA verb (subscribe, follow, comment, visit, read, download).',
    failExamples: [
      'Outro is a sign-off ("thanks for watching") with no CTA.',
      'Outro pitches an unrelated product not in canonical_core.cta_subscribe.',
    ],
    weight: 10,
  },
  {
    key: 'teleprompter_length_plausible',
    title: 'Teleprompter script length matches estimated duration',
    description:
      'Verify teleprompter_script word count is plausible for estimated_duration at a normal delivery rate (~150 wpm).',
    passWhen:
      'teleprompter_script word count is within 70%-130% of (estimated_duration_minutes × 150).',
    failExamples: [
      'Estimated duration 8 minutes but teleprompter is 300 words (~2 min of delivery).',
      'Estimated duration 5 minutes but teleprompter is 3000 words (~20 min of delivery).',
    ],
    weight: 10,
  },
  {
    key: 'thumbnail_specified',
    title: 'Thumbnail spec is complete',
    description:
      'Verify the thumbnail fields are filled in so design can execute without guessing.',
    passWhen:
      'thumbnail.text_overlay, thumbnail.emotion, and thumbnail.visual_style are all non-empty AND text_overlay is ≤ 6 words.',
    failExamples: [
      'thumbnail.text_overlay is empty.',
      'thumbnail.text_overlay is a full sentence with 12 words.',
    ],
    weight: 10,
  },
  {
    key: 'title_options_present',
    title: 'Exactly three title options provided',
    description:
      'Verify title_options has three distinct, non-empty options for A/B testing.',
    passWhen:
      'title_options.length === 3 AND each option is 30-70 characters AND no two options are near-duplicates.',
    failExamples: [
      'Only one title_option provided.',
      'Three options that differ by a single word.',
    ],
    weight: 10,
  },
  {
    key: 'description_has_timestamps',
    title: 'YouTube description has chapter timestamps when needed',
    description:
      'Verify multi-chapter videos surface timestamps in the description so YouTube renders the chapter UI.',
    passWhen:
      'If chapter_count > 1 then video_description contains at least chapter_count timestamp lines (formatted "MM:SS Title" or "00:MM:SS Title"). If chapter_count ≤ 1, this criterion passes automatically.',
    failExamples: [
      'chapter_count is 6 but description has no timestamps.',
      'Description has only 2 timestamps for a 6-chapter video.',
    ],
    weight: 10,
  },
  {
    key: 'strengths_preserved',
    title: 'Canonical key quotes and claims survive in script',
    description:
      'Verify canonical_core.argument_chain claims and key_quotes appear somewhere in the script.',
    passWhen:
      'All key_quotes from canonical_core appear in script.chapters[*].content or script.chapters[*].key_stat_or_quote (verbatim or near-verbatim with attribution) AND every argument_chain claim is addressed in its mapped chapter.',
    failExamples: [
      'Key quote from canonical core does not appear anywhere in the script.',
      'An argument_chain step has no corresponding chapter content.',
    ],
    weight: 10,
  },
];

/** Total possible score for a video draft (sum of all criterion weights). */
export const VIDEO_MAX_SCORE = VIDEO_CRITERIA.reduce((s, c) => s + c.weight, 0);
