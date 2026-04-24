import { z } from 'zod'

export const guardrailCategorySchema = z.enum([
  'content_boundaries',
  'tone_constraints',
  'factual_rules',
  'behavioral_rules',
])

export const createGuardrailSchema = z.object({
  category: guardrailCategorySchema,
  label: z.string().min(1),
  ruleText: z.string().min(1),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
})
export type CreateGuardrailInput = z.infer<typeof createGuardrailSchema>

export const updateGuardrailSchema = createGuardrailSchema.partial()
export type UpdateGuardrailInput = z.infer<typeof updateGuardrailSchema>

export const toggleGuardrailSchema = z.object({ isActive: z.boolean() })
export type ToggleGuardrailInput = z.infer<typeof toggleGuardrailSchema>
