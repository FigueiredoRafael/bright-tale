import { z } from 'zod'
import { autopilotConfigSchema } from './autopilotConfig'

export const startStageSchema = z.enum([
  'brainstorm', 'research', 'draft', 'review', 'assets', 'preview', 'publish',
])

export const setupProjectSchema = z.object({
  mode: z.enum(['step-by-step', 'supervised', 'overview']),
  autopilotConfig: autopilotConfigSchema.nullable(),
  templateId: z.string().nullable(),
  startStage: startStageSchema,
}).superRefine((v, ctx) => {
  if (v.mode !== 'step-by-step' && !v.autopilotConfig) {
    ctx.addIssue({
      code: 'custom',
      path: ['autopilotConfig'],
      message: 'autopilotConfig required for supervised/overview modes',
    })
  }
})

export type StartStage = z.infer<typeof startStageSchema>
export type SetupProjectInput = z.infer<typeof setupProjectSchema>
