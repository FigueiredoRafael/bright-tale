import { z } from 'zod'
import { aiProviderSchema } from './ai'

const ProviderOrInherit = aiProviderSchema.nullable()
const DefaultProvider = z.union([z.literal('recommended'), aiProviderSchema])

const BrainstormSlot = z.object({
  providerOverride: ProviderOrInherit,
  modelOverride: z.string().nullable().optional(),
  mode: z.enum(['topic_driven', 'reference_guided']),
  topic: z.string().trim().optional().nullable(),
  referenceUrl: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().url().nullable().optional(),
  ),
  niche: z.string().trim().optional(),
  tone: z.string().trim().optional(),
  audience: z.string().trim().optional(),
  goal: z.string().trim().optional(),
  constraints: z.string().trim().optional(),
}).superRefine((v, ctx) => {
  if (v.mode === 'topic_driven' && !v.topic) {
    ctx.addIssue({ code: 'custom', path: ['topic'], message: 'Topic required for topic-driven mode' })
  }
  if (v.mode === 'reference_guided' && !v.referenceUrl) {
    ctx.addIssue({ code: 'custom', path: ['referenceUrl'], message: 'URL required for reference-guided mode' })
  }
})

const ResearchSlot = z.object({
  providerOverride: ProviderOrInherit,
  modelOverride: z.string().nullable().optional(),
  depth: z.enum(['surface', 'medium', 'deep']),
})

const CanonicalCoreSlot = z.object({
  providerOverride: ProviderOrInherit,
  modelOverride: z.string().nullable().optional(),
  personaId: z.string().nullable(),
})

const DraftSlot = z.object({
  providerOverride: ProviderOrInherit,
  modelOverride: z.string().nullable().optional(),
  format: z.enum(['blog', 'video', 'shorts', 'podcast']),
  wordCount: z.number().int().positive().optional(),
}).superRefine((v, ctx) => {
  if (v.format === 'blog' && (!v.wordCount || v.wordCount <= 0)) {
    ctx.addIssue({ code: 'custom', path: ['wordCount'], message: 'Word count required for blog' })
  }
})

const ReviewSlot = z.object({
  providerOverride: ProviderOrInherit,
  modelOverride: z.string().nullable().optional(),
  maxIterations: z.number().int().min(0).max(20),
  autoApproveThreshold: z.number().int().min(0).max(100),
  hardFailThreshold: z.number().int().min(0).max(100),
}).superRefine((v, ctx) => {
  if (v.hardFailThreshold >= v.autoApproveThreshold) {
    ctx.addIssue({ code: 'custom', path: ['hardFailThreshold'], message: 'Must be lower than auto-approve threshold (else infinite loop)' })
  }
})

const AssetsSlot = z.object({
  providerOverride: ProviderOrInherit,
  modelOverride: z.string().nullable().optional(),
  mode: z.enum(['skip', 'briefs_only', 'auto_generate']),
})

const PreviewSlot = z.object({
  enabled: z.boolean(),
})

const PublishSlot = z.object({
  status: z.enum(['draft', 'published']),
})

export const autopilotConfigSchema = z.object({
  defaultProvider: DefaultProvider,
  brainstorm:    BrainstormSlot.nullable(),
  research:      ResearchSlot.nullable(),
  canonicalCore: CanonicalCoreSlot,
  draft:         DraftSlot,
  review:        ReviewSlot,
  assets:        AssetsSlot,
  preview:       PreviewSlot,
  publish:       PublishSlot,
})

export const autopilotConfigPatchSchema = autopilotConfigSchema.deepPartial()

export type AutopilotConfig = z.infer<typeof autopilotConfigSchema>
export type AutopilotConfigPatch = z.infer<typeof autopilotConfigPatchSchema>
