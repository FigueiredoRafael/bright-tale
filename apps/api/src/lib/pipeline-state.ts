const STAGES = ['brainstorm','research','canonical','production','review','assets','preview','publish'] as const
export type PipelineStage = typeof STAGES[number]

export function derivedFromStageResults(state: any): PipelineStage | null {
  const results = state?.stageResults ?? state?.stage_results
  if (!results || typeof results !== 'object') return null
  // Legacy pre-split state stored a single `draft` key. Treat it as both
  // canonical and production having completed so resume routes to review.
  const normalized: Record<string, unknown> = { ...results }
  if (normalized.draft) {
    normalized.canonical = normalized.canonical ?? normalized.draft
    normalized.production = normalized.production ?? normalized.draft
  }
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (normalized[STAGES[i]]) return STAGES[i]
  }
  return null
}

export function nextStageAfter(completed: PipelineStage | null): PipelineStage {
  if (completed === null) return 'brainstorm'
  const idx = STAGES.indexOf(completed)
  if (idx === -1 || idx === STAGES.length - 1) return 'publish'
  return STAGES[idx + 1]
}
