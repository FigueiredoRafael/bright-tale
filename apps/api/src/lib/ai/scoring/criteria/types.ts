/**
 * Rubric criterion contract. Each medium defines a list of criteria the
 * reviewer evaluates binary-pass-or-fail. Server-side scoring sums the
 * passing criteria * weight to produce the final review_score, replacing
 * the LLM's opinionated 0-100 score with a deterministic count.
 */
export interface RubricCriterion {
  /** Snake-case stable identifier used as key in rubric_evaluation. */
  key: string;
  /** Short human-readable label for prompt + UI. */
  title: string;
  /** What the reviewer must check. Imperative voice ("Verify that..."). */
  description: string;
  /** Concrete condition that makes this criterion PASS. */
  passWhen: string;
  /** Concrete examples of FAIL — included in prompt to anchor calibration. */
  failExamples: string[];
  /** Points awarded when this criterion passes. */
  weight: number;
}

export interface RubricEvaluation {
  [criterionKey: string]: {
    pass: boolean;
    /** Quote from the draft + brief reasoning. Required for both pass and fail. */
    evidence: string;
  };
}

/** Result of server-side scoring. */
export interface ComputedScore {
  /** Total points awarded (sum of passing criteria * weight). 0-100 range
   *  when the rubric weights sum to 100. */
  score: number;
  /** Maximum possible score given the rubric (sum of weights). */
  maxScore: number;
  /** Criteria the reviewer marked as failing, in rubric order. */
  failures: Array<{ key: string; title: string; passWhen: string; evidence: string }>;
  /** Criteria the reviewer marked as passing, in rubric order. */
  passes: Array<{ key: string; title: string }>;
  /** Criteria the reviewer did not evaluate (treated as fail, evidence: "not evaluated"). */
  missing: Array<{ key: string; title: string }>;
}
