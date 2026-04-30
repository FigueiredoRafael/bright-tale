/**
 * preview-disabled.test.tsx — Gate scenario 6
 *
 * Spec: when autopilotConfig.preview.enabled=false:
 *  - The PreviewEngine reads the flag and calls `derivePreview()` automatically
 *    to build a PreviewResult from context, then fires PREVIEW_COMPLETE.
 *  - The machine transitions to `publish` without any PREVIEW_GATE_TRIGGERED.
 *  - pendingDrillIn remains null throughout.
 *
 * The `preview.enabled` flag is consumed entirely inside PreviewEngine — the
 * machine itself has no guard on it.  The machine-level assertion here is:
 *  - PREVIEW_COMPLETE with no prior PREVIEW_GATE_TRIGGERED → machine transitions
 *    to publish, returnPromptOpen stays false.
 *
 * PreviewEngine's auto-derive behaviour requires the real engine rendering with
 * a stubbed `derivePreview` call — that is tested in PreviewEngine.test.tsx.
 * Here we only assert the machine-level side (no gate triggered path).
 */

import { describe, it, expect } from 'vitest'
import { createActor } from 'xstate'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'
import { BASE_AUTOPILOT_CONFIG } from './_helpers'

describe('Gate: preview.enabled=false (machine side)', () => {
  it('PREVIEW_COMPLETE without prior PREVIEW_GATE_TRIGGERED → machine moves to publish, no returnPromptOpen', () => {
    const config = {
      ...BASE_AUTOPILOT_CONFIG,
      preview: { enabled: false },
    }
    const actor = createActor(pipelineMachine, {
      input: {
        projectId: 'p',
        channelId: 'c',
        projectTitle: 'Test',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
      },
    })
    actor.start()
    actor.send({
      type: 'SETUP_COMPLETE',
      mode: 'overview',
      autopilotConfig: config,
      templateId: null,
      startStage: 'preview',
    })

    // No PREVIEW_GATE_TRIGGERED — pendingDrillIn must be null
    expect(actor.getSnapshot().context.pendingDrillIn).toBeNull()

    // PreviewEngine fires PREVIEW_COMPLETE after auto-derive
    actor.send({
      type: 'PREVIEW_COMPLETE',
      result: {
        imageMap: {},
        altTexts: {},
        categories: [],
        tags: [],
        seoOverrides: { title: 'T', slug: 's', metaDescription: 'd' },
        composedHtml: '<p>x</p>',
        autoDerived: true,
      },
    })

    const snap = actor.getSnapshot()
    actor.stop()

    const topState =
      typeof snap.value === 'string' ? snap.value : Object.keys(snap.value)[0]
    expect(topState).toBe('publish')
    // No drill-in → returnPromptOpen must stay false
    expect(snap.context.returnPromptOpen).toBe(false)
    expect(snap.context.pendingDrillIn).toBeNull()
  })

  it('pendingDrillIn stays null when machine passes through preview without gate', () => {
    const config = {
      ...BASE_AUTOPILOT_CONFIG,
      preview: { enabled: false },
    }
    const actor = createActor(pipelineMachine, {
      input: {
        projectId: 'p',
        channelId: 'c',
        projectTitle: 'Test',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
      },
    })
    actor.start()
    actor.send({
      type: 'SETUP_COMPLETE',
      mode: 'overview',
      autopilotConfig: config,
      templateId: null,
      startStage: 'preview',
    })

    // Context should never have pendingDrillIn='preview' set at any point
    expect(actor.getSnapshot().context.pendingDrillIn).toBeNull()
    actor.stop()
  })
})
