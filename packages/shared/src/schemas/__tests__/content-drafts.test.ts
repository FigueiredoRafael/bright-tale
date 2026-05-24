/**
 * S6 — Image-mode persistence: schema validation tests
 *
 * Acceptance criteria tested here:
 * - assetSettings.imageMode accepts 'generate'
 * - assetSettings.imageMode accepts 'prompts-only'
 * - assetSettings.imageMode rejects invalid values (400 territory)
 * - assetSettings with unknown keys is rejected (strict object)
 */
import { describe, it, expect } from 'vitest'
import { patchDraftAssetSettingsSchema } from '../content-drafts'

describe('patchDraftAssetSettingsSchema — assetSettings.imageMode', () => {
  it('accepts imageMode = generate', () => {
    const result = patchDraftAssetSettingsSchema.safeParse({
      assetSettings: { imageMode: 'generate' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts imageMode = prompts-only', () => {
    const result = patchDraftAssetSettingsSchema.safeParse({
      assetSettings: { imageMode: 'prompts-only' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid imageMode value', () => {
    const result = patchDraftAssetSettingsSchema.safeParse({
      assetSettings: { imageMode: 'auto' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown keys inside assetSettings (strict object)', () => {
    const result = patchDraftAssetSettingsSchema.safeParse({
      assetSettings: { imageMode: 'generate', unknownKey: true },
    })
    expect(result.success).toBe(false)
  })

  it('assetSettings field is optional (patch without it passes)', () => {
    const result = patchDraftAssetSettingsSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('exposes typed imageMode on success', () => {
    const result = patchDraftAssetSettingsSchema.safeParse({
      assetSettings: { imageMode: 'generate' },
    })
    if (!result.success) throw new Error('expected success')
    expect(result.data.assetSettings?.imageMode).toBe('generate')
  })
})
