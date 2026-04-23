import { z } from 'zod'

const writingVoiceSchema = z.object({
  writingStyle: z.string().min(1),
  signaturePhrases: z.array(z.string()),
  characteristicOpinions: z.array(z.string()),
})

const eeatSignalsSchema = z.object({
  analyticalLens: z.string().min(1),
  trustSignals: z.array(z.string()),
  expertiseClaims: z.array(z.string()),
})

const soulSchema = z.object({
  values: z.array(z.string()),
  lifePhilosophy: z.string().min(1),
  strongOpinions: z.array(z.string()),
  petPeeves: z.array(z.string()),
  humorStyle: z.string().min(1),
  recurringJokes: z.array(z.string()),
  whatExcites: z.array(z.string()),
  innerTensions: z.array(z.string()),
  languageGuardrails: z.array(z.string()),
})

export const createPersonaSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'slug must be lowercase with hyphens'),
  name: z.string().min(1),
  avatarUrl: z.string().url().optional(),
  bioShort: z.string().min(1),
  bioLong: z.string().min(1),
  primaryDomain: z.string().min(1),
  domainLens: z.string().min(1),
  approvedCategories: z.array(z.string()).min(1),
  writingVoiceJson: writingVoiceSchema,
  eeatSignalsJson: eeatSignalsSchema,
  soulJson: soulSchema,
})
export type CreatePersonaInput = z.infer<typeof createPersonaSchema>

export const updatePersonaSchema = createPersonaSchema.partial().omit({ slug: true })
export type UpdatePersonaInput = z.infer<typeof updatePersonaSchema>

export const togglePersonaSchema = z.object({ isActive: z.boolean() })
export type TogglePersonaInput = z.infer<typeof togglePersonaSchema>
