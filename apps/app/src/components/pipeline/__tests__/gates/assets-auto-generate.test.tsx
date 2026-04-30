/**
 * assets-auto-generate.test.tsx — Gate scenario 2
 *
 * Spec: when autopilotConfig.assets.mode='auto_generate', the machine stays in
 * `assets` (guard does NOT trigger auto-skip).  When ASSETS_COMPLETE fires (no
 * pendingDrillIn set), the machine transitions to `preview` directly — no
 * returnPromptOpen, no ASSETS_GATE_TRIGGERED required.
 *
 * Approach: pure machine state assertions.
 */

import { describe, it, expect } from 'vitest'
import { buildActor, BASE_AUTOPILOT_CONFIG } from './_helpers'

describe('Gate: assets.mode=auto_generate', () => {
  it('machine stays in assets after SETUP_COMPLETE (no auto-skip)', () => {
    const config = {
      ...BASE_AUTOPILOT_CONFIG,
      assets: { ...BASE_AUTOPILOT_CONFIG.assets, mode: 'auto_generate' as const },
    }
    const actor = buildActor('assets', config)
    const snap = actor.getSnapshot()
    actor.stop()

    const stateValue = snap.value
    const topState = typeof stateValue === 'string' ? stateValue : Object.keys(stateValue)[0]
    // auto_generate does NOT trigger the skip guard → stays in assets
    expect(topState).toBe('assets')
    // stageResults.assets is NOT pre-populated (no autoCompleteAssets ran)
    expect(snap.context.stageResults.assets).toBeUndefined()
  })

  it('ASSETS_COMPLETE (no pendingDrillIn) → machine advances to preview, no returnPromptOpen', () => {
    const config = {
      ...BASE_AUTOPILOT_CONFIG,
      assets: { ...BASE_AUTOPILOT_CONFIG.assets, mode: 'auto_generate' as const },
    }
    const actor = buildActor('assets', config)

    actor.send({
      type: 'ASSETS_COMPLETE',
      result: { assetIds: ['a1', 'a2'], featuredImageUrl: 'https://cdn/f.jpg' },
    })

    const snap = actor.getSnapshot()
    actor.stop()

    const stateValue = snap.value
    const topState = typeof stateValue === 'string' ? stateValue : Object.keys(stateValue)[0]
    expect(topState).toBe('preview')

    // No drill-in was set → returnPromptOpen stays false
    expect(snap.context.returnPromptOpen).toBe(false)
    expect(snap.context.pendingDrillIn).toBeNull()

    // Assets result persisted
    expect(snap.context.stageResults.assets?.assetIds).toEqual(['a1', 'a2'])
  })
})
