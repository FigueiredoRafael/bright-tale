/**
 * assets-skip.test.tsx — Gate scenario 1
 *
 * Spec: when autopilotConfig.assets.mode='skip', the machine auto-transitions
 * from assets.idle → preview without the AssetsEngine ever needing to mount
 * or fire ASSETS_COMPLETE.
 *
 * Implementation detail: the `assets.idle` state has an `always` guard that
 * checks `shouldSkipAssets` (context.autopilotConfig.assets.mode === 'skip').
 * When true, the machine runs `autoCompleteAssets` and transitions directly
 * to `preview`.
 *
 * Approach: pure machine state assertion — no rendering required.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { buildActor, BASE_AUTOPILOT_CONFIG } from './_helpers'

afterEach(() => {
  // nothing to clean up — actors are stopped inline
})

describe('Gate: assets.mode=skip', () => {
  it('machine skips assets stage and lands in preview without ASSETS_COMPLETE', () => {
    const config = {
      ...BASE_AUTOPILOT_CONFIG,
      assets: { ...BASE_AUTOPILOT_CONFIG.assets, mode: 'skip' as const },
    }
    const actor = buildActor('assets', config)

    // The `always` guard fires synchronously on state entry.
    // By the time buildActor() returns, the machine should already be in `preview`.
    const snap = actor.getSnapshot()
    actor.stop()

    const stateValue = snap.value
    const topState = typeof stateValue === 'string' ? stateValue : Object.keys(stateValue)[0]
    expect(topState).toBe('preview')
  })

  it('autoCompleteAssets populates stageResults.assets with skipped=true', () => {
    const config = {
      ...BASE_AUTOPILOT_CONFIG,
      assets: { ...BASE_AUTOPILOT_CONFIG.assets, mode: 'skip' as const },
    }
    const actor = buildActor('assets', config)
    const snap = actor.getSnapshot()
    actor.stop()

    // The `autoCompleteAssets` action should have filled stageResults.assets
    expect(snap.context.stageResults.assets).toBeDefined()
    expect(snap.context.stageResults.assets!.skipped).toBe(true)
    expect(snap.context.stageResults.assets!.assetIds).toEqual([])
  })
})
