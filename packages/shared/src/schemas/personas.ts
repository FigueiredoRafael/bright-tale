import { z } from 'zod'

const writingVoiceSchema = z.object({
  writingStyle: z.string().default(''),
  signaturePhrases: z.array(z.string()).default([]),
  characteristicOpinions: z.array(z.string()).default([]),
})

const eeatSignalsSchema = z.object({
  analyticalLens: z.string().default(''),
  trustSignals: z.array(z.string()).default([]),
  expertiseClaims: z.array(z.string()).default([]),
})

const soulSchema = z.object({
  values: z.array(z.string()).default([]),
  lifePhilosophy: z.string().default(''),
  strongOpinions: z.array(z.string()).default([]),
  petPeeves: z.array(z.string()).default([]),
  humorStyle: z.string().default(''),
  recurringJokes: z.array(z.string()).default([]),
  whatExcites: z.array(z.string()).default([]),
  innerTensions: z.array(z.string()).default([]),
  languageGuardrails: z.array(z.string()).default([]),
})

export const createPersonaSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'slug must be lowercase with hyphens'),
  name: z.string().min(1),
  avatarUrl: z.string().nullable().optional(),
  bioShort: z.string().default(''),
  bioLong: z.string().default(''),
  primaryDomain: z.string().default(''),
  domainLens: z.string().default(''),
  approvedCategories: z.array(z.string()).default([]),
  writingVoiceJson: writingVoiceSchema.default({}),
  eeatSignalsJson: eeatSignalsSchema.default({}),
  soulJson: soulSchema.default({}),
  archetypeSlug: z.string().nullable().optional(),
  avatarParamsJson: z.record(z.unknown()).nullable().optional(),
})
export type CreatePersonaInput = z.infer<typeof createPersonaSchema>

export const updatePersonaSchema = createPersonaSchema.partial().omit({ slug: true })
export type UpdatePersonaInput = z.infer<typeof updatePersonaSchema>

export const togglePersonaSchema = z.object({ isActive: z.boolean() })
export type TogglePersonaInput = z.infer<typeof togglePersonaSchema>
