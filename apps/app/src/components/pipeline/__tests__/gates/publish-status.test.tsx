/**
 * publish-status.test.tsx — Gate scenario 7
 *
 * Spec: when autopilotConfig.publish.status='published', the PublishEngine
 * sends `wpStatus='publish'` in the POST body to the WordPress API.
 *
 * NOTE: This scenario is already comprehensively covered by the existing test
 * suite at apps/app/src/components/engines/__tests__/PublishEngine.test.tsx:
 *   "publish.status='published' → POST body has wpStatus='publish'"
 *
 * We add a focused gate-suite entry here that:
 *  1. Exercises the same behaviour via the PipelineActorProvider pattern
 *     (PublishEngine + real actor configured with publish.status='published').
 *  2. Keeps the gate test suite self-contained.
 *
 * The implementation re-uses the PublishProgress mock approach from PublishEngine.test.tsx.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createActor } from 'xstate'
import React from 'react'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { PublishEngine } from '@/components/engines/PublishEngine'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'
import { BASE_AUTOPILOT_CONFIG } from './_helpers'
import type { AutopilotConfig } from '@brighttale/shared'

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

const capturedBodies: Record<string, unknown>[] = []

vi.mock('@/components/publish/PublishProgress', () => ({
  PublishProgress: ({
    publishBody,
    onComplete,
  }: {
    publishBody: Record<string, unknown>
    onComplete: (r: { wordpressPostId: number; publishedUrl: string }) => void
  }) => {
    capturedBodies.push(publishBody)
    void onComplete  // satisfy linter — not called in this test
    return <div data-testid="publish-progress" />
  },
}))

vi.mock('@/components/preview/PublishPanel', () => ({
  PublishPanel: ({
    onPublish,
    draftStatus,
  }: {
    onPublish: (params: { mode: string; scheduledDate?: string }) => void
    draftStatus: string
  }) => (
    <div>
      <span data-testid="draft-status">{draftStatus}</span>
      <button onClick={() => onPublish({ mode: 'publish' })}>Publish Now</button>
    </div>
  ),
}))

const STUB_DRAFT = {
  id: 'draft-1',
  title: 'Gate Draft',
  status: 'reviewed',
  wordpress_post_id: null,
  published_url: null,
}

function mountWithPublishStatus(status: 'draft' | 'published') {
  capturedBodies.length = 0

  const config: AutopilotConfig = {
    ...(BASE_AUTOPILOT_CONFIG as AutopilotConfig),
    publish: { status },
  }

  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'p-pub',
      channelId: 'c-pub',
      projectTitle: 'T',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
      initialStageResults: {
        draft: { draftId: 'draft-1', draftTitle: 'Gate Draft', draftContent: '', completedAt: new Date().toISOString() },
      },
    },
  }).start()

  actor.send({
    type: 'SETUP_COMPLETE',
    mode: 'overview',
    autopilotConfig: config,
    templateId: null,
    startStage: 'publish',
  })

  actor.send({ type: 'NAVIGATE', toStage: 'publish' })

  return render(
    <PipelineActorProvider value={actor}>
      <PublishEngine draft={STUB_DRAFT} />
    </PipelineActorProvider>,
  )
}

beforeEach(() => {
  capturedBodies.length = 0
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Gate: publish.status', () => {
  it("publish.status='published' → POST body contains wpStatus='publish'", async () => {
    const user = userEvent.setup()
    mountWithPublishStatus('published')

    await user.click(screen.getByRole('button', { name: /publish now/i }))

    expect(capturedBodies.length).toBe(1)
    expect(capturedBodies[0]!.wpStatus).toBe('publish')
  })

  it("publish.status='draft' → POST body contains wpStatus='draft'", async () => {
    const user = userEvent.setup()
    mountWithPublishStatus('draft')

    await user.click(screen.getByRole('button', { name: /publish now/i }))

    expect(capturedBodies.length).toBe(1)
    expect(capturedBodies[0]!.wpStatus).toBe('draft')
  })
})
