export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatTurnResponse {
  message: string
  done: boolean
  extracted?: Record<string, unknown>
}

export type ModuleId = 'persona_wizard' | 'onboarding_wizard'
