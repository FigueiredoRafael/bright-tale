import type { AutopilotConfig } from '@brighttale/shared'
import type { AutopilotStage } from './stageMapping.js'

export function resolveStageProvider(
  stage: AutopilotStage,
  config: AutopilotConfig,
  adminDefaults: { defaultProviders: Record<AutopilotStage, string> },
): string {
  const slot = config[stage] as { providerOverride?: string | null } | null | undefined
  if (slot && slot.providerOverride) return slot.providerOverride
  if (config.defaultProvider === 'recommended') {
    return adminDefaults.defaultProviders[stage]
  }
  return config.defaultProvider
}
