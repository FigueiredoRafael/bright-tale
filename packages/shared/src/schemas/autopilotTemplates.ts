import { z } from 'zod'
import { autopilotConfigSchema } from './autopilotConfig'

export const createAutopilotTemplateSchema = z.object({
  name:       z.string().trim().min(1).max(120),
  channelId:  z.string().uuid().nullable(),
  configJson: autopilotConfigSchema,
  isDefault:  z.boolean(),
})

export const updateAutopilotTemplateSchema = createAutopilotTemplateSchema.partial()

export type CreateAutopilotTemplateInput = z.infer<typeof createAutopilotTemplateSchema>
export type UpdateAutopilotTemplateInput = z.infer<typeof updateAutopilotTemplateSchema>
