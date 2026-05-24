/**
 * PublishEngine — video routing + bundle mode UI (issue #215)
 *
 * TDD: red→green per acceptance criterion.
 * Blog regression: existing flow unchanged when trackMedium is absent.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { StandaloneProjectContextProvider } from '@/components/pipeline/ProjectContextProvider'
import { PublishEngine } from '../PublishEngine'
import { VideoPublishPanel } from '../publish-drivers/VideoPublishPanel'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'

// ── Global mocks ──────────────────────────────────────────────────────────────

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/components/publish/PublishProgress', () => ({
  PublishProgress: () => <div data-testid="publish-progress" />,
}))

vi.mock('@/components/preview/PublishPanel', () => ({
  PublishPanel: () => <div data-testid="blog-publish-panel" />,
}))

vi.mock('@/hooks/use-auto-pilot-trigger', () => ({
  useAutoPilotTrigger: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Stub data ─────────────────────────────────────────────────────────────────

/**
 * draft_json shape mirrors real video drafts.
 * Keys match what VideoPublishPanel reads (snake_case per DB convention).
 */
const STUB_VIDEO_DRAFT_JSON = {
  channel: {
    name: 'Bright Curios',
    handle: '@brightcurios',
    subscribers: '128K',
  },
  video_title: 'The China Copycat Trap: Why Most Founders Steal the Wrong Lesson',
  video_description: `Copying China sounds easy. It rarely is.\n\nIn this video we unpack the hidden engine.`,
  pinned_comment: '👋 Sources at brightcurios.com/china-copycat — drop questions below.',
  tags: ['china business', 'entrepreneurship', 'small business', 'startup lessons'],
  thumbnail_ideas: [
    { title: 'Strike-through Copy', brief: 'Bold COPY text', mood: 'Punchy' },
    { title: 'Hidden Engine', brief: 'Exploded view', mood: 'Investigative' },
    { title: 'Two Founders', brief: 'Split frame', mood: 'Comparative' },
  ],
  lower_thirds: [
    { at: '0:42', label: 'The setup: copying was real' },
    { at: '2:30', label: 'The hidden engine' },
    { at: '4:15', label: 'What to steal instead' },
    { at: '6:50', label: '3 traps to avoid' },
    { at: '8:40', label: 'Subscribe — weekly drops' },
  ],
  script: {
    chapters: [
      {
        title: 'Yes, Copying Was Part of the Story',
        content: 'Let\'s start here.',
        broll: ['archival factory footage', 'license-deal photos', 'graph: tech-transfer rates'],
        duration: '1:48',
      },
      {
        title: 'The Hidden Engine Nobody Imports',
        content: 'Here\'s what the copy-paste reading skips.',
        broll: ['shipping ports timelapse', 'factory worker close-up'],
        duration: '1:45',
      },
    ],
  },
}

const STUB_DRAFT_DB = {
  id: 'video-draft-1',
  title: 'The China Copycat Trap',
  status: 'approved',
  wordpress_post_id: null,
  published_url: null,
  draft_json: STUB_VIDEO_DRAFT_JSON,
}

const VIDEO_STAGE_RESULTS = {
  draft: {
    draftId: 'video-draft-1',
    draftTitle: 'The China Copycat Trap',
    draftContent: '',
    completedAt: new Date().toISOString(),
  },
}

function mountVideoPublish(opts: {
  fetchDraftJson?: Record<string, unknown>
} = {}) {
  const draftJson = opts.fetchDraftJson ?? STUB_VIDEO_DRAFT_JSON

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/api/content-drafts/video-draft-1')) {
        return {
          ok: true,
          json: async () => ({
            data: { ...STUB_DRAFT_DB, draft_json: draftJson },
            error: null,
          }),
        } as Response
      }
      return { ok: true, json: async () => ({ data: null, error: null }) } as Response
    }),
  )

  return render(
    <StandaloneProjectContextProvider
      projectId="proj-video"
      channelId="ch-1"
      mode={null}
      autopilotConfig={null}
      initialStageResults={VIDEO_STAGE_RESULTS}
      pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
      creditSettings={DEFAULT_CREDIT_SETTINGS}
    >
      <PublishEngine trackMedium="video" />
    </StandaloneProjectContextProvider>,
  )
}

function mountBlogPublish() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null, error: null }),
    } as Response),
  )

  return render(
    <StandaloneProjectContextProvider
      projectId="proj-blog"
      channelId="ch-1"
      mode={null}
      autopilotConfig={null}
      initialStageResults={{}}
      pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
      creditSettings={DEFAULT_CREDIT_SETTINGS}
    >
      <PublishEngine />
    </StandaloneProjectContextProvider>,
  )
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('PublishEngine — video routing (issue #215)', () => {
  // ── AC1: Target channel card ────────────────────────────────────────────────
  it('renders target-channel card with channel name, handle, subs, and connected badge', async () => {
    mountVideoPublish()
    // Channel card should appear after draft self-hydrates
    await screen.findByTestId('video-publish-channel-card')
    expect(screen.getByText('Bright Curios')).toBeInTheDocument()
    expect(screen.getByText(/@brightcurios/i)).toBeInTheDocument()
    expect(screen.getByText(/128K/i)).toBeInTheDocument()
    expect(screen.getByText(/connected/i)).toBeInTheDocument()
  })

  // ── AC2: Mode toggle defaults to bundle ─────────────────────────────────────
  it('mode toggle renders bundle and direct options, defaulting to bundle', async () => {
    mountVideoPublish()
    await screen.findByTestId('video-publish-mode-toggle')
    // Bundle should be the active/selected mode by default
    const bundleBtn = screen.getByRole('button', { name: /bundle handoff/i })
    const directBtn = screen.getByRole('button', { name: /direct publish/i })
    expect(bundleBtn).toBeInTheDocument()
    expect(directBtn).toBeInTheDocument()
    // Bundle actions (CTA) should be visible in default bundle mode
    expect(screen.getByTestId('video-publish-bundle-actions')).toBeInTheDocument()
  })

  // ── AC3: Direct mode shows placeholder ─────────────────────────────────────
  it('switching to direct mode shows coming-soon placeholder', async () => {
    const user = userEvent.setup()
    mountVideoPublish()
    await screen.findByTestId('video-publish-mode-toggle')
    const directBtn = screen.getByRole('button', { name: /direct publish/i })
    await user.click(directBtn)
    expect(screen.getByTestId('video-publish-direct-placeholder')).toBeInTheDocument()
    expect(screen.getByText(/direct publish.*coming soon/i)).toBeInTheDocument()
  })

  // ── AC4a: Asset checklist row counts from draft_json ───────────────────────
  it('asset checklist: thumbnail row shows count of thumbnail_ideas', async () => {
    mountVideoPublish()
    await screen.findByTestId('video-publish-checklist')
    // 3 thumbnail_ideas → "3 concepts"
    expect(screen.getByText(/3 concepts/i)).toBeInTheDocument()
  })

  it('asset checklist: b-roll row shows total broll items from script chapters', async () => {
    mountVideoPublish()
    await screen.findByTestId('video-publish-checklist')
    // chapter[0].broll has 3, chapter[1].broll has 2 → 5 items
    expect(screen.getByText(/5 items/i)).toBeInTheDocument()
  })

  it('asset checklist: lower-thirds row shows cue count', async () => {
    mountVideoPublish()
    await screen.findByTestId('video-publish-checklist')
    // 5 lower_thirds
    expect(screen.getByText(/5 cues/i)).toBeInTheDocument()
  })

  it('asset checklist: title row shows char/100 detail', async () => {
    mountVideoPublish()
    await screen.findByTestId('video-publish-checklist')
    const titleLen = STUB_VIDEO_DRAFT_JSON.video_title.length
    expect(screen.getByText(new RegExp(`${titleLen}/100`))).toBeInTheDocument()
  })

  it('asset checklist: description row shows char count', async () => {
    mountVideoPublish()
    await screen.findByTestId('video-publish-checklist')
    const descLen = STUB_VIDEO_DRAFT_JSON.video_description.length
    expect(screen.getByText(new RegExp(`${descLen} chars`))).toBeInTheDocument()
  })

  it('asset checklist: tags row shows tag count', async () => {
    mountVideoPublish()
    await screen.findByTestId('video-publish-checklist')
    expect(screen.getByText(/4 tags/i)).toBeInTheDocument()
  })

  it('asset checklist: pinned comment row shows "ready"', async () => {
    mountVideoPublish()
    await screen.findByTestId('video-publish-checklist')
    expect(screen.getByText(/ready/i)).toBeInTheDocument()
  })

  // ── AC5: Copy buttons write correct content to clipboard ───────────────────
  // These tests render VideoPublishPanel directly with an onCopyText callback
  // to avoid jsdom's missing Clipboard API (navigator.clipboard is undefined).
  it('copy button on title row calls onCopyText with video_title', async () => {
    const user = userEvent.setup()
    const onCopyText = vi.fn()
    render(<VideoPublishPanel draftJson={STUB_VIDEO_DRAFT_JSON} onCopyText={onCopyText} />)
    const copyTitleBtn = screen.getByTestId('copy-btn-title')
    await user.click(copyTitleBtn)
    expect(onCopyText).toHaveBeenCalledWith(STUB_VIDEO_DRAFT_JSON.video_title)
  })

  it('copy button on description row calls onCopyText with video_description', async () => {
    const user = userEvent.setup()
    const onCopyText = vi.fn()
    render(<VideoPublishPanel draftJson={STUB_VIDEO_DRAFT_JSON} onCopyText={onCopyText} />)
    const copyDescBtn = screen.getByTestId('copy-btn-description')
    await user.click(copyDescBtn)
    expect(onCopyText).toHaveBeenCalledWith(STUB_VIDEO_DRAFT_JSON.video_description)
  })

  it('copy button on tags row calls onCopyText with tags joined by comma+space', async () => {
    const user = userEvent.setup()
    const onCopyText = vi.fn()
    render(<VideoPublishPanel draftJson={STUB_VIDEO_DRAFT_JSON} onCopyText={onCopyText} />)
    const copyTagsBtn = screen.getByTestId('copy-btn-tags')
    await user.click(copyTagsBtn)
    expect(onCopyText).toHaveBeenCalledWith(STUB_VIDEO_DRAFT_JSON.tags.join(', '))
  })

  it('copy button on pinned-comment row calls onCopyText with pinned_comment', async () => {
    const user = userEvent.setup()
    const onCopyText = vi.fn()
    render(<VideoPublishPanel draftJson={STUB_VIDEO_DRAFT_JSON} onCopyText={onCopyText} />)
    const copyCommentBtn = screen.getByTestId('copy-btn-pinned-comment')
    await user.click(copyCommentBtn)
    expect(onCopyText).toHaveBeenCalledWith(STUB_VIDEO_DRAFT_JSON.pinned_comment)
  })

  // ── AC6: Image download buttons disabled with tooltip ──────────────────────
  it('thumbnail download button is disabled', async () => {
    mountVideoPublish()
    await screen.findByTestId('video-publish-checklist')
    const dlBtn = screen.getByTestId('dl-btn-thumbnail')
    expect(dlBtn).toBeDisabled()
  })

  it('thumbnail download button has coming-next tooltip text in DOM', async () => {
    mountVideoPublish()
    await screen.findByTestId('video-publish-checklist')
    // The tooltip content is rendered in the DOM via TooltipContent (portal)
    // We test it via aria-label or title attribute on the wrapper, or data-testid
    expect(screen.getByTestId('dl-tooltip-thumbnail')).toBeInTheDocument()
    expect(screen.getByTestId('dl-tooltip-thumbnail').textContent).toMatch(/coming next/i)
  })

  it('b-roll download button is disabled with coming-next tooltip', async () => {
    mountVideoPublish()
    await screen.findByTestId('video-publish-checklist')
    const dlBtn = screen.getByTestId('dl-btn-broll')
    expect(dlBtn).toBeDisabled()
    expect(screen.getByTestId('dl-tooltip-broll').textContent).toMatch(/coming next/i)
  })

  // ── AC7: Bundle CTA is disabled with tooltip ────────────────────────────────
  it('"Download bundle (.zip)" CTA is disabled', async () => {
    mountVideoPublish()
    await screen.findByTestId('video-publish-bundle-actions')
    const bundleCta = screen.getByTestId('bundle-download-cta')
    expect(bundleCta).toBeDisabled()
  })

  it('"Download bundle (.zip)" CTA has coming-next tooltip text in DOM', async () => {
    mountVideoPublish()
    await screen.findByTestId('video-publish-bundle-actions')
    const bundleTooltip = screen.getByTestId('bundle-download-tooltip')
    expect(bundleTooltip.textContent).toMatch(/coming next/i)
  })

  // ── Blog regression ─────────────────────────────────────────────────────────
  it('blog track (no trackMedium) renders existing panel — no channel card, no mode toggle', async () => {
    mountBlogPublish()
    await screen.findByTestId('publish-engine-root')
    // The video-specific elements must NOT appear in blog mode
    expect(screen.queryByTestId('video-publish-channel-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('video-publish-mode-toggle')).not.toBeInTheDocument()
  })
})
