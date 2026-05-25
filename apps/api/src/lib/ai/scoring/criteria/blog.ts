import type { RubricCriterion } from './types.js';

/**
 * Blog rubric — 10 criteria, 10 points each = 100 max. Replaces the LLM's
 * opinionated 0-100 score with a deterministic Σ(pass ? 10 : 0). Reviewer
 * evaluates each criterion binary; server computes the total.
 *
 * Each criterion has:
 *   - `passWhen`: concrete pass condition the reviewer applies
 *   - `failExamples`: 1-3 patterns that DO NOT pass, to anchor calibration
 *     (e.g. "consider starting with a question" is aesthetic preference, not
 *     a defect — so it must not by itself fail `has_strong_hook`).
 *
 * Keep keys snake_case and stable — they're persisted in
 * review_feedback_json.blog_review.rubric_evaluation.
 */
export const BLOG_CRITERIA: RubricCriterion[] = [
  {
    key: 'has_strong_hook',
    title: 'Strong hook in the opening',
    description:
      'Verify the opening paragraph engages the target reader by naming the pain/problem AND using an anchored rhetorical device.',
    passWhen:
      'The first paragraph (a) identifies the target reader or the pain/problem they recognize, AND (b) uses any anchored rhetorical device: a direct question, a statistic, a concrete scenario, a contrarian/counterintuitive claim, a vivid anecdote, or an explicit stakes-naming statement.',
    failExamples: [
      'Opens with a generic definitional sentence ("CRMs are tools that...") with no reader/pain identification.',
      'Opens with vague marketing language ("In today\'s fast-paced world...") with no anchored device.',
    ],
    weight: 10,
  },
  {
    key: 'thesis_clear_in_intro',
    title: 'Thesis stated in the introduction',
    description:
      'Verify the canonical_core thesis is expressed clearly within the first paragraph or H2 lead-in.',
    passWhen:
      'The canonical_core.thesis is restated or paraphrased within the first 200 words of the full_draft, with the reader able to extract the core claim without reading further.',
    failExamples: [
      'Introduction lists topic but never states the actual thesis claim.',
      'Thesis only surfaces in the final section.',
    ],
    weight: 10,
  },
  {
    key: 'meets_word_count',
    title: 'Word count within target band',
    description:
      'Verify the full_draft length falls inside the production target range.',
    passWhen:
      'full_draft word count is between 85% and 125% of productionParams.target_word_count (or, if absent, between 1000 and 3000 words for a blog).',
    failExamples: [
      'Draft is 600 words when target was 1500.',
      'Draft is 4000 words when target was 1500.',
    ],
    weight: 10,
  },
  {
    key: 'claims_have_inline_citations',
    title: 'Statistical claims have inline attribution',
    description:
      'Verify every numeric or quoted factual claim is followed by an inline source attribution in the same paragraph (not only in a trailing Sources list).',
    passWhen:
      'Each bolded statistic, dollar figure, or quoted claim has an attribution phrase ("according to HubSpot", "per the SBA", or an inline quote with author + credential) in the same paragraph.',
    failExamples: [
      '"$0 forever" appears bolded but the source is only in the Sources section at the bottom.',
      'Statistics cited without attribution ("studies show that...").',
    ],
    weight: 10,
  },
  {
    key: 'outline_matches_canonical',
    title: 'H2 structure matches canonical argument chain',
    description:
      'Verify the outline H2s correspond to the canonical_core.argument_chain steps in order.',
    passWhen:
      'The number of H2 sections equals the number of canonical_core.argument_chain steps, and each H2 covers the matching step\'s claim (paraphrase allowed).',
    failExamples: [
      'Canonical has 4 argument steps but the draft only has 2 H2 sections.',
      'H2 order does not follow the argument_chain order.',
    ],
    weight: 10,
  },
  {
    key: 'no_promotional_tone',
    title: 'Tone is informative, not promotional',
    description:
      'Verify the draft avoids marketing speak about specific vendors or products.',
    passWhen:
      'No sentence reads as advertising copy. Vendor mentions are limited to factual statements (price, feature) without superlatives ("best in class", "must-have", "leading"). Affiliate insert is the only place that may carry a soft CTA.',
    failExamples: [
      '"HubSpot is the best CRM for any small business."',
      '"You\'ll love Zoho — it\'s the must-have tool for growing teams."',
    ],
    weight: 10,
  },
  {
    key: 'sentence_clarity',
    title: 'Sentences are clear and digestible',
    description:
      'Verify the prose avoids long compound sentences that obscure meaning.',
    passWhen:
      'Average sentence length across the full_draft is ≤ 25 words AND no individual sentence exceeds 50 words.',
    failExamples: [
      'Multiple 60-80 word run-on sentences chaining 4+ clauses with commas.',
      'Average sentence length above 30 words across the draft.',
    ],
    weight: 10,
  },
  {
    key: 'seo_meta_optimized',
    title: 'SEO meta fields present and on-target',
    description:
      'Verify the meta_description and title include the primary keyword and meet length conventions.',
    passWhen:
      'meta_description is 100-160 characters AND contains the primary_keyword (case-insensitive). Title is 30-70 characters AND contains the primary_keyword.',
    failExamples: [
      'meta_description is 50 chars (too short).',
      'Title omits the primary keyword entirely.',
    ],
    weight: 10,
  },
  {
    key: 'cta_present_and_aligned',
    title: 'CTA present and aligned with canonical',
    description:
      'Verify the draft ends with a subscribe/comment CTA aligned with canonical_core.cta_subscribe.',
    passWhen:
      'The final 2 paragraphs contain a CTA (subscribe, comment, follow) AND its intent matches canonical_core.cta_subscribe / cta_comment_prompt.',
    failExamples: [
      'Draft ends with a summary paragraph; no CTA at all.',
      'CTA pitches an unrelated product not in the canonical.',
    ],
    weight: 10,
  },
  {
    key: 'strengths_preserved',
    title: 'Canonical strengths preserved in draft',
    description:
      'Verify the canonical_core.argument_chain claims and key_quotes survive in the draft body.',
    passWhen:
      'All key_quotes from canonical_core appear in the draft verbatim (or near-verbatim with author attribution), AND each argument_chain claim is addressed in its mapped section.',
    failExamples: [
      'Key quote from Brent Leary is paraphrased without attribution.',
      'An argument_chain step is missing from the body entirely.',
    ],
    weight: 10,
  },
];

/** Total possible score for a blog draft (sum of all criterion weights). */
export const BLOG_MAX_SCORE = BLOG_CRITERIA.reduce((s, c) => s + c.weight, 0);
