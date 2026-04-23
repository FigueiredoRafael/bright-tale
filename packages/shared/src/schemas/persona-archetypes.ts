import { z } from 'zod'

const archetypeOverlaySchema = z.object({
  constraints: z.array(z.string()).default([]),
  behavioralAdditions: z.array(z.string()).default([]),
})

export const createArchetypeSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'slug must be lowercase with hyphens'),
  name: z.string().min(1),
  description: z.string().default(''),
  icon: z.string().default(''),
  defaultFieldsJson: z.record(z.unknown()).default({}),
  behavioralOverlayJson: archetypeOverlaySchema.default({ constraints: [], behavioralAdditions: [] }),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})
export type CreateArchetypeInput = z.infer<typeof createArchetypeSchema>

export const updateArchetypeSchema = createArchetypeSchema.partial().omit({ slug: true })
export type UpdateArchetypeInput = z.infer<typeof updateArchetypeSchema>

export const toggleArchetypeSchema = z.object({ isActive: z.boolean() })
export type ToggleArchetypeInput = z.infer<typeof toggleArchetypeSchema>
