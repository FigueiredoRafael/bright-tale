/**
 * Production YAML parser
 * Extracts a typed ProductionOutput from the raw BC_PRODUCTION_OUTPUT YAML
 * returned by Agent 3. Handles both flat and wrapped formats.
 * Returns a typed ParseResult instead of throwing.
 */

import yaml from "js-yaml";
import type { ProductionOutput } from "@brighttale/shared/types/agents";

export type ParseResult =
  | { success: true; data: ProductionOutput; error?: never }
  | { success: false; error: string; data?: never };

/** Normalizes LLM visual_style variants before validation */
function normalizeVisualStyle(val: unknown): unknown {
  if (typeof val !== "string") return val;
  const normalized = val.toLowerCase().replace(/_/g, " ").trim();
  if (normalized === "talking head" || normalized === "talking-head") return "talking head";
  if (normalized === "b-roll" || normalized === "b roll" || normalized === "broll") return "b-roll";
  if (normalized === "text overlay" || normalized === "text-overlay") return "text overlay";
  return val;
}

/** Recursively normalizes visual_style fields in the shorts array */
function normalizeShorts(shorts: unknown): unknown {
  if (!Array.isArray(shorts)) return shorts;
  return shorts.map((s) => {
    if (s && typeof s === "object" && "visual_style" in s) {
      return { ...s, visual_style: normalizeVisualStyle((s as Record<string, unknown>).visual_style) };
    }
    return s;
  });
}

/**
 * Parses a raw YAML string (flat or BC_PRODUCTION_OUTPUT-wrapped) into
 * a typed ProductionOutput. Returns a discriminated ParseResult.
 */
export function parseProductionYaml(raw: string): ParseResult {
  if (!raw || !raw.trim()) {
    return { success: false, error: "No production content found. Input is empty." };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = yaml.load(raw) as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to parse YAML: ${msg}` };
  }

  if (!parsed || typeof parsed !== "object") {
    return { success: false, error: "No production content found. YAML parsed to a non-object value." };
  }

  // Unwrap BC_PRODUCTION_OUTPUT if present
  let content: Record<string, unknown>;
  if (parsed.BC_PRODUCTION_OUTPUT && typeof parsed.BC_PRODUCTION_OUTPUT === "object") {
    content = parsed.BC_PRODUCTION_OUTPUT as Record<string, unknown>;
  } else if (parsed.blog || parsed.video || parsed.shorts) {
    content = parsed;
  } else {
    return {
      success: false,
      error:
        "No production content found. Expected a 'blog', 'video', or 'shorts' key (or a BC_PRODUCTION_OUTPUT wrapper).",
    };
  }

  // Validate required sections
  const required = ["blog", "video", "shorts", "podcast", "engagement"] as const;
  const missing = required.filter((key) => !content[key]);
  if (missing.length > 0) {
    return {
      success: false,
      error: `Missing required sections: ${missing.join(", ")}. Ensure the YAML includes all five sections.`,
    };
  }

  // Normalize coercible fields
  const normalized: Record<string, unknown> = {
    ...content,
    shorts: normalizeShorts(content.shorts),
  };

  return { success: true, data: normalized as unknown as ProductionOutput };
}
