import type { AutopilotConfig, AutopilotConfigPatch } from '@brighttale/shared'

export function deepMergeAutopilotConfig(
  base: AutopilotConfig,
  patch: AutopilotConfigPatch,
): AutopilotConfig {
  if (base === null || base === undefined) {
    throw new Error('deepMergeAutopilotConfig requires a non-null base')
  }

  const result = { ...base }

  for (const key of Object.keys(patch) as Array<keyof AutopilotConfigPatch>) {
    const baseValue = base[key]
    const patchValue = patch[key]

    if (baseValue === null || baseValue === undefined) {
      continue
    }

    if (patchValue !== null && patchValue !== undefined && typeof patchValue === 'object') {
      (result as Record<string, unknown>)[key] = { ...(baseValue as Record<string, unknown>), ...(patchValue as Record<string, unknown>) }
    } else if (patchValue !== undefined) {
      (result as Record<string, unknown>)[key] = patchValue
    }
  }

  return result
}
