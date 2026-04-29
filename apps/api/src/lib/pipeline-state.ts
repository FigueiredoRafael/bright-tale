const STAGES = ['brainstorm','research','draft','review','assets','preview','publish'] as const
export type PipelineStage = typeof STAGES[number]

export function derivedFromStageResults(state: any): PipelineStage | null {
  const results = state?.stageResults ?? state?.stage_results
  if (!results || typeof results !== 'object') return null
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (results[STAGES[i]]) return STAGES[i]
  }
  return null
}

export function nextStageAfter(completed: PipelineStage | null): PipelineStage {
  if (completed === null) return 'brainstorm'
  const idx = STAGES.indexOf(completed)
  if (idx === -1 || idx === STAGES.length - 1) return 'publish'
  return STAGES[idx + 1]
}
