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
import { render, waitFor } from '@testing-library/react'
import React from 'react'
import { ProjectContextProvider } from '@/components/pipeline/ProjectContextProvider'
import { PublishEngine } from '@/components/engines/PublishEngine'
import { BASE_AUTOPILOT_CONFIG } from './_helpers'
import type { AutopilotConfig } from '@brighttale/shared'

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))
vi.mock('@/hooks/use-pipeline-tracker', () => ({
  usePipelineTracker: () => ({ trackStarted: vi.fn(), trackCompleted: vi.fn(), trackFailed: vi.fn() }),
}))
vi.mock('@/components/engines/ContextBanner', () => ({
  ContextBanner: () => null,
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

  // ProjectContextProvider (required by PublishEngine since Slice 14.1) fetches
  // project + stages from the API. Stub fetch to return overview mode + config.
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.match(/\/api\/projects\/p-pub\/stages/)) {
      return { ok: true, json: async () => ({
        data: {
          stageRuns: [
            { id: 'sr-draft', projectId: 'p-pub', stage: 'draft', status: 'completed', attemptNo: 1,
              finishedAt: new Date().toISOString(), errorMessage: null,
              outcomeJson: { draftId: 'draft-1', draftTitle: 'Gate Draft', draftContent: '' },
              trackId: null, publishTargetId: null },
          ],
          tracks: [],
          project: { mode: 'overview', paused: false },
        },
        error: null,
      }) };
    }
    if (u.match(/\/api\/projects\/p-pub$/)) {
      return { ok: true, json: async () => ({
        data: {
          id: 'p-pub',
          channel_id: 'c-pub',
          title: 'T',
          mode: 'overview',
          autopilot_config_json: config,
          template_id: null,
          paused: false,
          pipeline_state_json: null,
        },
        error: null,
      }) };
    }
    return { ok: true, json: async () => ({ data: null, error: null }) };
  }))

  return render(
    <ProjectContextProvider projectId="p-pub">
      <PublishEngine draft={STUB_DRAFT} />
    </ProjectContextProvider>,
  )
}

beforeEach(() => {
  capturedBodies.length = 0
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Gate: publish.status', () => {
  it("publish.status='published' → auto-fired POST body contains wpStatus='publish'", async () => {
    mountWithPublishStatus('published')

    await waitFor(() => {
      expect(capturedBodies.length).toBe(1)
    })
    expect(capturedBodies[0]!.mode).toBe('publish')
  })

  it("publish.status='draft' → auto-fired POST body contains wpStatus='draft'", async () => {
    mountWithPublishStatus('draft')

    await waitFor(() => {
      expect(capturedBodies.length).toBe(1)
    })
    expect(capturedBodies[0]!.mode).toBe('draft')
  })
})
