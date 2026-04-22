import type { QualityTier } from "../schemas/review";

export function deriveTier(review: unknown): QualityTier {
  if (!review || typeof review !== "object") return "not_requested";
  const r = review as Record<string, unknown>;

  if (typeof r.quality_tier === "string") {
    const t = r.quality_tier as QualityTier;
    if (["excellent", "good", "needs_revision", "reject", "not_requested"].includes(t)) {
      return t;
    }
  }

  if (typeof r.score === "number") {
    const s = r.score;
    if (s >= 90) return "excellent";
    if (s >= 75) return "good";
    if (s >= 50) return "needs_revision";
    return "reject";
  }

  return "not_requested";
}

export function isApprovedTier(tier: QualityTier): boolean {
  return tier === "excellent" || tier === "good";
}
