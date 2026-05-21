import { z } from 'zod'

export const MODULE_SLUGS = [
  'persona_wizard',
  'onboarding_wizard',
  'persona_fixer',
  'persona_voice_preview',
] as const

export type ModuleSlug = typeof MODULE_SLUGS[number]

export const MODULE_LABELS: Record<ModuleSlug, string> = {
  persona_wizard: 'Criação de Personas',
  onboarding_wizard: 'Onboarding',
  persona_fixer: 'Melhoria de Personas',
  persona_voice_preview: 'Preview de Voz',
}

export const upsertModuleAiAssignmentSchema = z.object({
  moduleSlug: z.enum(MODULE_SLUGS),
  provider: z.string().min(1),
  model: z.string().min(1),
})
export type UpsertModuleAiAssignmentInput = z.infer<typeof upsertModuleAiAssignmentSchema>

export interface ModuleAiAssignment {
  id: string
  moduleSlug: ModuleSlug
  provider: string
  model: string
  createdAt: string
  updatedAt: string
}
