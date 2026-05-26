/**
 * Wave 3 of yt-pipeline-v2 (G7) — derive BC_SHORTS_INPUT from an existing video.
 *
 * Until now BC_SHORTS was always derived directly from BC_CANONICAL_CORE,
 * which threw away the LLM's per-chapter signal of which arguments earned
 * the deepest treatment in the long-form video. This mapper fuses the two:
 * the canonical core supplies the structural fields the agent contract
 * requires, and the video output re-ranks the argument_chain so that the
 * BC_SHORTS agent picks its 2 supplementary shorts (Short #2 and #3) from
 * the chapters the video actually leaned into.
 *
 * Short #1 always derives from emotional_arc.turning_point per the agent
 * rules — that's the single highest-charge moment of the narrative and
 * doesn't need re-ranking.
 */
import type {
  CanonicalCore,
  CanonicalCoreArgumentStep,
  CanonicalCoreStat,
  VideoOutput,
} from "../types/agents";

export interface ShortsInput {
  idea_id: string;
  thesis: string;
  /** Aha-moment — Short #1 hook source. Pulled from emotional_arc. */
  turning_point: string;
  /**
   * Argument steps in priority order. The first two are the strongest
   * (re-ranked using the video's chapter weights when available) and seed
   * shorts #2 and #3 respectively.
   */
  argument_chain: CanonicalCoreArgumentStep[];
  key_stats: CanonicalCoreStat[];
  cta_subscribe?: string;
  cta_comment_prompt?: string;
}

interface MapperOptions {
  /**
   * Hard cap on how many argument steps to forward to the agent. The shorts
   * agent only emits 3 shorts (turning_point + top-2 chain steps), so 3 steps
   * is the practical cap; bumping it to 5 hands the agent more headroom in
   * case the top picks fail validation. Default 5.
   */
  maxArgumentSteps?: number;
}

/**
 * Score a chapter as a proxy for "how strongly the LLM developed this
 * argument step in the long-form video". Two signals:
 * - Length of generated `content` — the model spent more tokens here.
 * - Presence of a `key_stat_or_quote` — the chapter has a concrete data
 *   anchor that translates well to a short-form hook.
 */
function chapterStrength(chapter: NonNullable<VideoOutput["script"]["chapters"]>[number]): number {
  if (!chapter || typeof chapter !== "object") return 0;
  const contentLen = typeof chapter.content === "string" ? chapter.content.length : 0;
  const hasStat = typeof chapter.key_stat_or_quote === "string" && chapter.key_stat_or_quote.trim().length > 0;
  return contentLen + (hasStat ? 500 : 0);
}

/**
 * Build a BC_SHORTS_INPUT from a video draft's output and its source canonical
 * core. The mapper is pure — no IO, no LLM calls — so it can be reused by the
 * shorts-derivation endpoint, by tests, and by any future automation that
 * wants the same lineage.
 */
export function mapVideoOutputToShortsInput(
  videoOutput: VideoOutput | undefined | null,
  canonicalCore: CanonicalCore,
  options: MapperOptions = {},
): ShortsInput {
  const maxSteps = options.maxArgumentSteps ?? 5;
  const chain = Array.isArray(canonicalCore.argument_chain) ? canonicalCore.argument_chain.slice() : [];

  // Rank steps by the long-form video's investment per chapter, when present.
  const chapters = Array.isArray(videoOutput?.script?.chapters) ? videoOutput!.script!.chapters! : [];
  if (chapters.length > 0) {
    const score = new Map<number, number>();
    for (const ch of chapters) {
      const num = typeof ch?.chapter_number === "number" ? ch.chapter_number : NaN;
      if (Number.isFinite(num)) score.set(num, chapterStrength(ch));
    }
    chain.sort((a, b) => (score.get(b.step) ?? 0) - (score.get(a.step) ?? 0));
  }

  const trimmedChain = chain.slice(0, maxSteps);

  return {
    idea_id: canonicalCore.idea_id,
    thesis: canonicalCore.thesis,
    turning_point: canonicalCore.emotional_arc?.turning_point ?? "",
    argument_chain: trimmedChain,
    key_stats: Array.isArray(canonicalCore.key_stats) ? canonicalCore.key_stats : [],
    cta_subscribe: canonicalCore.cta_subscribe,
    cta_comment_prompt: canonicalCore.cta_comment_prompt,
  };
}
