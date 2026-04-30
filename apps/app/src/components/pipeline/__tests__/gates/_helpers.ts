/**
 * _helpers.ts — shared test utilities for Wave 2 gate scenario tests.
 *
 * Provides:
 *  - BASE_AUTOPILOT_CONFIG  — a fully-valid AutopilotConfig to spread/override
 *  - buildActor()           — creates + starts a real pipelineMachine actor
 *    at a given stage with a given autopilotConfig, ready for assertions.
 */

import { createActor } from 'xstate'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'
import type { AutopilotConfig } from '@brighttale/shared'
import type { PipelineStage } from '@/components/engines/types'

export const BASE_AUTOPILOT_CONFIG: AutopilotConfig = {
  defaultProvider: 'recommended',
  brainstorm: {
    providerOverride: null,
    mode: 'topic_driven',
    topic: 'AI in 2026',
    referenceUrl: null,
    niche: '',
    tone: '',
    audience: '',
    goal: '',
    constraints: '',
  },
  research: { providerOverride: null, depth: 'medium' },
  canonicalCore: { providerOverride: null, personaId: null },
  draft: { providerOverride: null, format: 'blog', wordCount: 1000 },
  review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 },
  assets: { providerOverride: null, mode: 'briefs_only' },
  preview: { enabled: false },
  publish: { status: 'draft' },
}

/**
 * Build and start a real pipelineMachine actor.
 * - Calls SETUP_COMPLETE with `startStage` so the machine lands at the desired stage.
 * - Returns the running actor (caller is responsible for stopping it).
 */
export function buildActor(
  startStage: PipelineStage,
  autopilotConfig: AutopilotConfig,
  overrides: {
    mode?: 'overview' | 'step-by-step' | 'supervised'
  } = {},
) {
  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'p-gate',
      channelId: 'c-gate',
      projectTitle: 'Gate Test',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
    },
  })
  actor.start()
  actor.send({
    type: 'SETUP_COMPLETE',
    mode: overrides.mode ?? 'overview',
    autopilotConfig,
    templateId: null,
    startStage,
  })
  return actor
}
