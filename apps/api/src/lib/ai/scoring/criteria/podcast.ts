import type { RubricCriterion } from './types.js';

/**
 * Podcast rubric — 10 criteria, 10 points each = 100 max. Audio-first
 * episodes are evaluated against the BC_REVIEW_INPUT.production.podcast
 * schema fields the reviewer sees in its prompt.
 *
 * Keys persisted in review_feedback_json.podcast_review.rubric_evaluation —
 * keep snake_case and stable.
 */
export const PODCAST_CRITERIA: RubricCriterion[] = [
  {
    key: 'has_strong_intro_hook',
    title: 'Intro hook engages the listener in the first 30 seconds',
    description:
      'Verify intro_hook draws the listener in before any context dump.',
    passWhen:
      'intro_hook is non-empty AND uses 1st-person or 2nd-person framing ("you", "we", "I noticed") AND opens with an anchored device: a question, a stat, a contrarian claim, or a scenario.',
    failExamples: [
      'Intro hook is a generic show-intro template with no anchored device.',
      'Intro hook reads as 3rd-person narration with no listener address.',
    ],
    weight: 10,
  },
  {
    key: 'episode_title_present',
    title: 'Episode title is concrete and within length',
    description:
      'Verify episode_title is filled in and fits podcast directory conventions.',
    passWhen:
      'episode_title is non-empty AND is 20-120 characters AND names a specific angle (not a generic show name).',
    failExamples: [
      'episode_title is empty.',
      'episode_title is the channel name only with no episode-specific topic.',
    ],
    weight: 10,
  },
  {
    key: 'description_hook_matches_intro',
    title: 'Episode description aligns with the intro hook',
    description:
      'Verify episode_description previews the same angle the intro_hook delivers.',
    passWhen:
      'episode_description is non-empty AND its opening sentence covers the same angle as intro_hook (paraphrase allowed, contradictions disqualify).',
    failExamples: [
      'Description promises a debate but the intro is a solo monologue.',
      'Description and intro hook discuss different topics.',
    ],
    weight: 10,
  },
  {
    key: 'talking_points_aligned_to_canonical',
    title: 'Talking points cover the canonical argument chain',
    description:
      'Verify talking_points map to canonical_core.argument_chain steps in order.',
    passWhen:
      'talking_points.length is between canonical_core.argument_chain.length and (argument_chain.length + 2) AND each argument_chain claim is addressed in at least one talking_point.point.',
    failExamples: [
      'Canonical has 4 argument steps but only 1 talking_point covers any of them.',
      'Talking points cover unrelated tangents instead of the canonical chain.',
    ],
    weight: 10,
  },
  {
    key: 'talking_points_have_notes',
    title: 'Every talking point ships with notes',
    description:
      'Verify the host is not left guessing at the studio.',
    passWhen:
      'For every entry in talking_points: notes is non-empty AND ≥ 25 words of guidance (stat, quote, framing, or transition).',
    failExamples: [
      'A talking point has empty notes.',
      'Notes are a single sentence with no stat or quote to anchor the host.',
    ],
    weight: 10,
  },
  {
    key: 'outro_has_cta',
    title: 'Outro contains an explicit listener CTA',
    description:
      'Verify outro names a concrete next action (follow, leave a review, share, click the show notes link).',
    passWhen:
      'outro is non-empty AND contains an imperative CTA verb (subscribe, follow, leave a review, share, comment, visit, read).',
    failExamples: [
      'Outro is a sign-off ("see you next week") with no CTA.',
      'Outro pitches an unrelated sponsor not in canonical_core.cta_subscribe.',
    ],
    weight: 10,
  },
  {
    key: 'duration_estimate_plausible',
    title: 'Duration estimate is set and reasonable',
    description:
      'Verify duration_estimate is present and within the expected band for the show format.',
    passWhen:
      'duration_estimate is non-empty AND parses to a minute count between 5 and 90 minutes.',
    failExamples: [
      'duration_estimate is empty.',
      'duration_estimate is "3h" — implausibly long for the format.',
    ],
    weight: 10,
  },
  {
    key: 'no_fabricated_first_person',
    title: 'Host prompts contain no fabricated first-person claims',
    description:
      'Verify host_talking_prompts do not invent personal experiences the host did not have.',
    passWhen:
      'No entry in host_talking_prompts contains a fabricated first-person claim (e.g. "when I ran a $10M agency", "in my 15 years as a CTO") that is not present in canonical_core or research as the host\'s own experience.',
    failExamples: [
      'Host prompt scripts "I sold my SaaS for $50M last year" with no canonical evidence.',
      'Host prompt invents a personal interaction with a named executive.',
    ],
    weight: 10,
  },
  {
    key: 'guest_questions_open_ended',
    title: 'Guest questions are open-ended',
    description:
      'Verify guest_questions invite expansion rather than yes/no answers (when guest_questions exist).',
    passWhen:
      'If guest_questions is non-empty: every question starts with how, what, why, when, where, walk us through, tell us about, or describe. If guest_questions is empty (solo episode), this criterion passes automatically.',
    failExamples: [
      'Guest question is "Did you like X?" — yes/no closed.',
      'Guest question is a statement followed by "right?" — leading, not open.',
    ],
    weight: 10,
  },
  {
    key: 'strengths_preserved',
    title: 'Canonical key quotes and claims appear in the episode',
    description:
      'Verify canonical_core.key_quotes and argument_chain claims survive in talking_points or their notes.',
    passWhen:
      'All key_quotes from canonical_core appear verbatim (with attribution) in either a talking_point.notes or host_talking_prompts entry AND every argument_chain claim is addressed in talking_points.',
    failExamples: [
      'A key quote from canonical_core is missing from talking_points entirely.',
      'An argument_chain step has no corresponding talking_point.',
    ],
    weight: 10,
  },
];

/** Total possible score for a podcast draft (sum of all criterion weights). */
export const PODCAST_MAX_SCORE = PODCAST_CRITERIA.reduce((s, c) => s + c.weight, 0);
