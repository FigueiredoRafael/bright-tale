import type { Stage } from '@brighttale/shared/pipeline/inputs';
import type { AutopilotConfig } from '@brighttale/shared/schemas/autopilotConfig';

// Maps the canonical Stage enum to the slot key used in `autopilotConfigSchema`.
// The schema still uses the legacy `canonicalCore` and `draft` slot names; the
// pipeline split (T1.6) renamed the corresponding Stages to `canonical` and
// `production`. A later milestone will rename the schema slots to match.
const STAGE_TO_SLOT_KEY = {
  brainstorm: 'brainstorm',
  research: 'research',
  canonical: 'canonicalCore',
  production: 'draft',
  review: 'review',
  assets: 'assets',
  preview: 'preview',
  publish: 'publish',
} as const satisfies Record<Stage, keyof AutopilotConfig>;

export type SlotKeyForStage<S extends Stage> = (typeof STAGE_TO_SLOT_KEY)[S];
export type SlotForStage<S extends Stage> = AutopilotConfig[SlotKeyForStage<S>];

const FALLBACK_BY_STAGE: { [S in Stage]: SlotForStage<S> } = {
  brainstorm: null,
  research: null,
  canonical: {
    providerOverride: null,
    modelOverride: null,
    personaId: null,
  },
  production: {
    providerOverride: null,
    modelOverride: null,
    format: 'blog',
    wordCount: 1000,
  },
  review: {
    providerOverride: null,
    modelOverride: null,
    maxIterations: 3,
    autoApproveThreshold: 90,
    hardFailThreshold: 50,
  },
  assets: {
    providerOverride: null,
    modelOverride: null,
    mode: 'briefs_only',
  },
  preview: { enabled: false },
  publish: { status: 'draft' },
};

export interface AutopilotConfigSource {
  autopilotConfigJson: unknown;
}

/**
 * resolveAutopilotConfig — coalesces project defaults with per-Track overrides
 * to produce the resolved AutopilotConfig slot for a given Stage.
 *
 * Precedence (per slot): track ▸ project ▸ FALLBACK_BY_STAGE. Object slots
 * merge shallowly (track keys overlay project keys overlay fallback keys);
 * an explicit `null` from track or project means "no slot for this Track"
 * and is returned as-is (only allowed for the nullable brainstorm / research
 * slots).
 *
 * Each source's `autopilotConfigJson` is treated as opaque JSONB. Validation
 * happens at the PATCH endpoint that writes the column; the resolver assumes
 * the stored shape conforms to `autopilotConfigSchema` (or a deep partial).
 */
export function resolveAutopilotConfig<S extends Stage>(
  project: AutopilotConfigSource | null,
  track: AutopilotConfigSource | null,
  stage: S,
): SlotForStage<S> {
  const slotKey = STAGE_TO_SLOT_KEY[stage];
  const fallback = FALLBACK_BY_STAGE[stage];

  const projectSlot = readSlot(project?.autopilotConfigJson, slotKey);
  const trackSlot = readSlot(track?.autopilotConfigJson, slotKey);

  if (trackSlot !== undefined) {
    if (trackSlot === null) return null as SlotForStage<S>;
    return mergeSlot(fallback, projectSlot, trackSlot) as SlotForStage<S>;
  }
  if (projectSlot !== undefined) {
    if (projectSlot === null) return null as SlotForStage<S>;
    return mergeSlot(fallback, undefined, projectSlot) as SlotForStage<S>;
  }
  return fallback as unknown as SlotForStage<S>;
}

function readSlot(json: unknown, slotKey: keyof AutopilotConfig): unknown {
  if (!json || typeof json !== 'object') return undefined;
  const record = json as Record<string, unknown>;
  if (!(slotKey in record)) return undefined;
  return record[slotKey];
}

function mergeSlot(
  fallback: unknown,
  projectSlot: unknown,
  trackSlot: unknown,
): unknown {
  if (fallback === null) {
    return mergeObjects(projectSlot, trackSlot);
  }
  return mergeObjects(fallback, projectSlot, trackSlot);
}

function mergeObjects(...layers: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const layer of layers) {
    if (layer && typeof layer === 'object') {
      Object.assign(out, layer as Record<string, unknown>);
    }
  }
  return out;
}
