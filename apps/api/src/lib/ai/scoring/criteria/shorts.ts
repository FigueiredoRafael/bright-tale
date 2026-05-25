import type { RubricCriterion } from './types.js';

/**
 * Shorts rubric — 10 criteria, 10 points each = 100 max. Shorts production
 * outputs an array of short objects (hook, script, visual_style,
 * duration_target). The rubric evaluates the BATCH (not one short at a time)
 * because the reviewer sees the full array in BC_REVIEW_INPUT.production.shorts.
 *
 * Keys persisted in review_feedback_json.shorts_review.rubric_evaluation —
 * keep snake_case and stable.
 */
export const SHORTS_CRITERIA: RubricCriterion[] = [
  {
    key: 'all_have_scroll_stopping_hook',
    title: 'Every short has a scroll-stopping hook',
    description:
      'Verify each short opens with a hook that stops a scrolling viewer within 1-2 seconds.',
    passWhen:
      'For every short in the array: hook is non-empty AND uses an anchored device (direct question, stat, contrarian claim, vivid scenario, or stakes statement) within the first sentence.',
    failExamples: [
      'A short\'s hook is a 3-sentence setup with no stakes named.',
      'A short opens with channel branding instead of a hook.',
    ],
    weight: 10,
  },
  {
    key: 'duration_under_60s',
    title: 'Every short fits the vertical short-form window',
    description:
      'Verify duration_target is within the platform short-form limit so the script can actually be cut to length.',
    passWhen:
      'For every short: duration_target parses to ≤ 60 seconds AND is ≥ 15 seconds.',
    failExamples: [
      'A short\'s duration_target is "90s".',
      'A short\'s duration_target is "8s" — too short to deliver any payload.',
    ],
    weight: 10,
  },
  {
    key: 'script_supports_hook',
    title: 'Script body delivers on the hook',
    description:
      'Verify each script pays off the promise made in the hook within the duration budget.',
    passWhen:
      'For every short: script directly addresses the claim/question raised in the hook AND does not pivot to an unrelated payload.',
    failExamples: [
      'Hook promises "the one mistake founders make" but the script is a generic overview.',
      'Hook asks a question that the script never answers.',
    ],
    weight: 10,
  },
  {
    key: 'visual_style_specified',
    title: 'Visual style is named for each short',
    description:
      'Verify visual_style is filled in so production knows the shoot format.',
    passWhen:
      'For every short: visual_style is non-empty AND uses one of the canonical labels (talking head | b-roll | text overlay | screen recording | hybrid).',
    failExamples: [
      'visual_style is empty on at least one short.',
      'visual_style is a vague phrase like "engaging" with no format named.',
    ],
    weight: 10,
  },
  {
    key: 'has_cta',
    title: 'Every short ends with a CTA',
    description:
      'Verify each short closes with an explicit next-action prompt.',
    passWhen:
      'For every short: the script\'s final line contains an imperative CTA verb (follow, subscribe, comment, watch the long-form, link in bio, save).',
    failExamples: [
      'Script ends mid-thought with no CTA.',
      'Script ends with "thanks for watching" only — no action prompt.',
    ],
    weight: 10,
  },
  {
    key: 'count_meets_target',
    title: 'Number of shorts matches production target',
    description:
      'Verify shorts.length matches productionParams.target_short_count (default 3).',
    passWhen:
      'shorts.length equals productionParams.target_short_count when provided, otherwise shorts.length is between 3 and 5.',
    failExamples: [
      'Target was 3 shorts but only 1 was produced.',
      'No production target and only 1 short produced (below the 3-5 default band).',
    ],
    weight: 10,
  },
  {
    key: 'distinct_angles',
    title: 'Shorts cover distinct angles',
    description:
      'Verify each short approaches the canonical thesis from a different angle rather than rephrasing the same hook.',
    passWhen:
      'No two shorts share a near-duplicate hook (paraphrase allowed) AND each short maps to a different canonical_core.argument_chain step or key_quote.',
    failExamples: [
      'Two shorts open with the same statistic and arrive at the same conclusion.',
      'All shorts re-explain the same canonical step.',
    ],
    weight: 10,
  },
  {
    key: 'no_lengthy_setup',
    title: 'Payload starts within the first 3 seconds',
    description:
      'Verify the script does not waste the scroll-stop window on setup.',
    passWhen:
      'For every short: the hook delivers the curiosity gap or stakes inside the first sentence (≈3 seconds of delivery) before any narrator setup.',
    failExamples: [
      'Short opens with "Hey guys, today I want to talk about..." for 5 seconds before any payload.',
      'Short opens with a long contextual story before the hook lands.',
    ],
    weight: 10,
  },
  {
    key: 'canonical_thread',
    title: 'Each short ties back to the canonical core',
    description:
      'Verify every short is anchored to a canonical_core argument step or key_quote, not a tangential point.',
    passWhen:
      'Each short references at least one canonical_core.argument_chain claim or key_quote (verbatim or paraphrased with attribution).',
    failExamples: [
      'A short rides a viral framing unrelated to the canonical thesis.',
      'A short cites a stat not present in canonical_core or research.',
    ],
    weight: 10,
  },
  {
    key: 'format_distinct_from_video',
    title: 'Shorts are not verbatim long-form extracts',
    description:
      'Verify shorts are rewritten for the short-form format, not pasted chapter slices from the long-form video.',
    passWhen:
      'No short\'s script is a verbatim copy of a long-form chapter\'s content (paraphrase and condensation expected).',
    failExamples: [
      'Short\'s script is byte-identical to chapter 2 of the video script.',
      'Short is a 60-second slice of the teleprompter with no vertical-format rewrite.',
    ],
    weight: 10,
  },
];

/** Total possible score for a shorts batch (sum of all criterion weights). */
export const SHORTS_MAX_SCORE = SHORTS_CRITERIA.reduce((s, c) => s + c.weight, 0);
