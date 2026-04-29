import type { AgentType } from './provider.js'

export type AutopilotStage = 'brainstorm' | 'research' | 'canonicalCore' | 'draft' | 'review' | 'assets'

export const AGENT_FOR_AUTOPILOT_STAGE: Record<AutopilotStage, AgentType> = {
  brainstorm:    'brainstorm',
  research:      'research',
  canonicalCore: 'production',
  draft:         'production',
  review:        'review',
  assets:        'assets',
}
