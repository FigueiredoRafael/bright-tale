import { z } from 'zod'

export const assignChannelPersonaSchema = z.object({
  personaId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
})
export type AssignChannelPersonaInput = z.infer<typeof assignChannelPersonaSchema>

export const setPrimaryChannelPersonaSchema = z.object({ isPrimary: z.boolean() })
export type SetPrimaryChannelPersonaInput = z.infer<typeof setPrimaryChannelPersonaSchema>
