import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { PreviewEngine } from '../PreviewEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

const STUB_DRAFT = {
  id: 'draft-1',
  title: 'Stub Draft',
  draft_json: {
    blog: {
      full_draft: '## Section A\n\nBody A.\n\n## Section B\n\nBody B.',
      outline: [{ h2: 'Section A' }, { h2: 'Section B' }],
    },
  },
  review_feedback_json: {
    publication_plan: {
      blog: {
        categories: ['cat-1'],
        tags: ['tag-1'],
        final_seo: { title: 'SEO Title', slug: 'seo-slug', meta_description: 'SEO desc' },
      },
    },
  },
}

const STUB_ASSETS = [
  { id: 'asset-feat', source_url: 'https://x/f.jpg', webp_url: null, alt_text: 'feat alt', role: 'featured_image' },
  { id: 'asset-1',    source_url: 'https://x/1.jpg', webp_url: null, alt_text: 's1 alt',   role: 'body_section_1' },
  { id: 'asset-2',    source_url: 'https://x/2.jpg', webp_url: null, alt_text: 's2 alt',   role: 'body_section_2' },
]

function mountAtPreviewStage() {
  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'proj-1',
      channelId: 'ch-1',
      projectTitle: 'T',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
      initialStageResults: {
        brainstorm: { ideaId: 'idea-1', ideaTitle: 'Idea T', ideaVerdict: 'viable', ideaCoreTension: 'tension', completedAt: new Date().toISOString() },
        research:   { researchSessionId: 'rs-1', approvedCardsCount: 3, researchLevel: 'medium', completedAt: new Date().toISOString() },
        draft:      { draftId: 'draft-1', draftTitle: 'Stub Draft', draftContent: '', completedAt: new Date().toISOString() },
        review:     { score: 92, verdict: 'approved', feedbackJson: STUB_DRAFT.review_feedback_json, iterationCount: 1, completedAt: new Date().toISOString() },
        assets:     { assetIds: ['asset-feat', 'asset-1', 'asset-2'], featuredImageUrl: 'https://x/f.jpg', completedAt: new Date().toISOString() },
      },
    },
  }).start()

  // Navigate to preview stage
  actor.send({ type: 'NAVIGATE', toStage: 'preview' })

  const utils = render(
    <PipelineActorProvider value={actor}>
      <PreviewEngine />
    </PipelineActorProvider>,
  )
  return { actor, ...utils }
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/api/content-drafts/draft-1')) {
        return { ok: true, json: async () => ({ data: STUB_DRAFT, error: null }) } as Response
      }
      if (String(url).includes('/api/assets?content_id=draft-1')) {
        return { ok: true, json: async () => ({ data: { assets: STUB_ASSETS }, error: null }) } as Response
      }
      return { ok: true, json: async () => ({ data: null, error: null }) } as Response
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PreviewEngine', () => {
  it('reads draftId from actor and loads draft + assets without legacy props', async () => {
    mountAtPreviewStage()
    // Loader visible first, then the approve button after fetches resolve.
    await screen.findByRole('button', { name: /approve.*publish/i })
  })

  it('dispatches PREVIEW_COMPLETE with PreviewResult shape on approve', async () => {
    const user = userEvent.setup()
    const { actor } = mountAtPreviewStage()
    const approveBtn = await screen.findByRole('button', { name: /approve.*publish/i })

    await user.click(approveBtn)

    const preview = actor.getSnapshot().context.stageResults.preview
    expect(preview).toBeDefined()
    expect(preview!.imageMap).toMatchObject({
      featured_image: 'asset-feat',
      body_section_1: 'asset-1',
      body_section_2: 'asset-2',
    })
    expect(preview!.categories).toEqual(['cat-1'])
    expect(preview!.tags).toEqual(['tag-1'])
    expect(preview!.seoOverrides).toEqual({ title: 'SEO Title', slug: 'seo-slug', metaDescription: 'SEO desc' })
  })

  it('dispatches NAVIGATE to assets when Back is clicked', async () => {
    const user = userEvent.setup()
    const { actor } = mountAtPreviewStage()
    await screen.findByRole('button', { name: /approve.*publish/i })

    const backBtn = screen.getByRole('button', { name: /^back$/i })
    await user.click(backBtn)

    // NAVIGATE to 'assets' rewinds the machine to the assets state.
    expect(actor.getSnapshot().value).toMatchObject({ assets: expect.anything() })
  })
})
