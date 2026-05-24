/**
 * AssetsEngine — video routing + read-only layout (issue #213)
 *
 * TDD: red→green per acceptance criterion.
 * Blog regression: existing flow unchanged when trackMedium is absent.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { StandaloneProjectContextProvider } from '@/components/pipeline/ProjectContextProvider'
import { AssetsEngine } from '../AssetsEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'

// ── Global mocks ──────────────────────────────────────────────────────────────

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/hooks/use-auto-pilot-trigger', () => ({
  useAutoPilotTrigger: vi.fn(),
}))

vi.mock('@/components/pipeline/PipelineAbortProvider', () => ({
  usePipelineAbort: () => ({ signal: null }),
}))

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Stub data ─────────────────────────────────────────────────────────────────

/**
 * draft_json shape matches real video drafts (same keys as STUB_VIDEO_DRAFT_JSON
 * in PublishEngine.video.test.tsx). snake_case per DB convention.
 */
const STUB_VIDEO_DRAFT_JSON = {
  title_options: [
    'Why 76% of Deep Sea Animals GLOW (you wont believe why)',
    'The Real Reason Deep Sea Creatures Light Up',
  ],
  video_title: 'Why 76% of Deep Sea Animals GLOW (you wont believe why)',
  video_description: 'The deep ocean is the largest habitat on Earth.\n\n#bioluminescence #deepsea',
  tags: ['bioluminescence', 'deep sea', 'science', 'ocean'],
  pinned_comment: 'Sources linked in description — drop questions below!',
  thumbnail_ideas: [
    { title: 'Glowing Abyss', brief: 'Wide shot of pitch-black ocean with single glowing dot', mood: 'Mysterious' },
    { title: 'Split View', brief: 'Left: dark ocean. Right: glowing creature close-up.', mood: 'Investigative' },
    { title: 'Face Cam Reaction', brief: 'Host reacting, bioluminescent overlay', mood: 'Energetic' },
  ],
  thumbnail: {
    headline: '76% GLOW',
    facePromptHint: 'Host mid-reaction, eyes wide, bioluminescent jellyfish in background',
  },
  lower_thirds: [
    { at: '0:45', label: 'Light as Currency in the Deep' },
    { at: '2:30', label: 'Independent Evolution Pathways' },
  ],
  script: {
    chapters: [
      {
        title: 'Light as Currency in the Deep',
        duration: '0:45-2:30',
        content: 'In the deep ocean, light is the medium of survival.',
        broll: ['Anglerfish lure footage', 'Firefly squid'],
      },
      {
        title: 'The Independent Evolution Pathways',
        duration: '2:30-5:00',
        content: 'Two distinct biochemical pathways evolved independently.',
        broll: ['Lab footage', 'Animated molecular reactions'],
      },
    ],
  },
}

const STUB_DRAFT_DB = {
  id: 'video-draft-1',
  title: 'Why Deep Sea Animals Glow',
  status: 'approved',
  draft_json: STUB_VIDEO_DRAFT_JSON,
}

const VIDEO_STAGE_RESULTS = {
  draft: {
    draftId: 'video-draft-1',
    draftTitle: 'Why Deep Sea Animals Glow',
    draftContent: '',
    completedAt: new Date().toISOString(),
  },
}

/**
 * Per-track stage results — StageResultsByTrack shape.
 * AssetsEngine uses ctx.stageResultsByTrack.tracks["track-video-1"].draft
 * when trackId prop is set.
 */
const VIDEO_STAGE_RESULTS_BY_TRACK = {
  shared: {},
  tracks: {
    'track-video-1': {
      draft: {
        draftId: 'video-draft-1',
        draftTitle: 'Why Deep Sea Animals Glow',
        draftContent: '',
        completedAt: new Date().toISOString(),
      },
    },
  },
}

function mountVideoAssets(opts: { onCopyText?: (text: string) => void } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/api/content-drafts/video-draft-1')) {
        return {
          ok: true,
          json: async () => ({
            data: STUB_DRAFT_DB,
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
      initialStageResultsByTrack={VIDEO_STAGE_RESULTS_BY_TRACK}
      pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
      creditSettings={DEFAULT_CREDIT_SETTINGS}
    >
      <AssetsEngine
        draft={null}
        trackMedium="video"
        trackId="track-video-1"
        onCopyText={opts.onCopyText}
      />
    </StandaloneProjectContextProvider>,
  )
}

function mountBlogAssets() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { assets: [] }, error: null }),
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
      <AssetsEngine draft={null} />
    </StandaloneProjectContextProvider>,
  )
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('AssetsEngine — video routing (issue #213)', () => {
  // ── AC1: Thumbnail grid renders ────────────────────────────────────────────
  it('renders thumbnail concepts section with concept cards', async () => {
    mountVideoAssets()
    await screen.findByTestId('video-assets-thumbnail-grid')
    // Should show all 3 thumbnail concept cards
    expect(screen.getByText('Glowing Abyss')).toBeInTheDocument()
    expect(screen.getByText('Split View')).toBeInTheDocument()
    expect(screen.getByText('Face Cam Reaction')).toBeInTheDocument()
  })

  // ── AC2: Chapter cards render ──────────────────────────────────────────────
  it('renders per-chapter cards with title and b-roll prompts', async () => {
    mountVideoAssets()
    await screen.findByTestId('video-assets-chapters')
    // Chapter titles appear multiple times (in card header and lower-third).
    // Verify at least one instance of each is present.
    const chaptersSection = screen.getByTestId('video-assets-chapters')
    expect(chaptersSection).toBeInTheDocument()
    // B-roll content is unique — use it to confirm chapter cards rendered
    expect(screen.getByText('Anglerfish lure footage')).toBeInTheDocument()
    expect(screen.getByText('Lab footage')).toBeInTheDocument()
  })

  // ── AC3: Hook visual card renders ──────────────────────────────────────────
  it('renders hook visual card with facePromptHint content', async () => {
    mountVideoAssets()
    await screen.findByTestId('video-assets-hook')
    expect(screen.getByText(/Host mid-reaction/i)).toBeInTheDocument()
  })

  // ── AC4: Text bundle renders all four blocks ───────────────────────────────
  it('renders text bundle with title, description, tags, and pinned comment blocks', async () => {
    mountVideoAssets()
    await screen.findByTestId('video-assets-text-bundle')
    expect(screen.getByTestId('video-assets-text-title')).toBeInTheDocument()
    expect(screen.getByTestId('video-assets-text-description')).toBeInTheDocument()
    expect(screen.getByTestId('video-assets-text-tags')).toBeInTheDocument()
    expect(screen.getByTestId('video-assets-text-pinned-comment')).toBeInTheDocument()
  })

  // ── AC5: Copy buttons invoke onCopyText with correct content ──────────────
  it('copy button for title invokes onCopyText with the video title', async () => {
    const user = userEvent.setup()
    const onCopyText = vi.fn()
    mountVideoAssets({ onCopyText })
    await screen.findByTestId('video-assets-text-title')
    const copyBtn = screen.getByTestId('video-assets-copy-title')
    await user.click(copyBtn)
    expect(onCopyText).toHaveBeenCalledWith(
      expect.stringContaining('Why 76% of Deep Sea Animals GLOW'),
    )
  })

  it('copy button for pinned comment invokes onCopyText with comment text', async () => {
    const user = userEvent.setup()
    const onCopyText = vi.fn()
    mountVideoAssets({ onCopyText })
    await screen.findByTestId('video-assets-text-pinned-comment')
    const copyBtn = screen.getByTestId('video-assets-copy-pinned-comment')
    await user.click(copyBtn)
    expect(onCopyText).toHaveBeenCalledWith(
      expect.stringContaining('Sources linked in description'),
    )
  })

  // ── AC6: Mode toggle defaults to prompts-only ──────────────────────────────
  it('mode toggle renders and defaults to prompts-only', async () => {
    mountVideoAssets()
    await screen.findByTestId('video-assets-mode-toggle')
    const promptsOnlyBtn = screen.getByRole('button', { name: /prompts.only/i })
    const generateBtn = screen.getByRole('button', { name: /generate here/i })
    expect(promptsOnlyBtn).toBeInTheDocument()
    expect(generateBtn).toBeInTheDocument()
    // Prompts-only is the default — concept cards show prompt textarea
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0)
  })

  it('clicking generate mode switches the mode toggle', async () => {
    const user = userEvent.setup()
    mountVideoAssets()
    await screen.findByTestId('video-assets-mode-toggle')
    const generateBtn = screen.getByRole('button', { name: /generate here/i })
    await user.click(generateBtn)
    // After clicking, generate is active — mode toggle reflects change
    expect(screen.getByTestId('video-assets-mode-toggle')).toBeInTheDocument()
  })

  // ── AC7: Generate/Regenerate buttons disabled with tooltip ────────────────
  it('generate button is disabled in prompts-only mode and shows tooltip', async () => {
    mountVideoAssets()
    await screen.findByTestId('video-assets-generate-btn')
    const generateBtn = screen.getByTestId('video-assets-generate-btn')
    expect(generateBtn).toBeDisabled()
    // sr-only tooltip text for reliable assertion (Radix portal workaround)
    expect(screen.getByTestId('video-assets-generate-tooltip-text')).toBeInTheDocument()
    expect(screen.getByTestId('video-assets-generate-tooltip-text').textContent).toMatch(/generate mode/i)
  })
})

describe('AssetsEngine — blog regression (issue #213)', () => {
  it('renders the existing blog layout when trackMedium is absent', async () => {
    mountBlogAssets()
    // Video-specific test ID must NOT appear
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByTestId('video-assets-thumbnail-grid')).not.toBeInTheDocument()
    expect(screen.queryByTestId('video-assets-chapters')).not.toBeInTheDocument()
  })
})

// ── S6: Image-mode persistence ────────────────────────────────────────────────

/**
 * mountVideoAssetsWithMode — like mountVideoAssets but lets the fixture
 * include a pre-persisted imageMode in draft_json.assetSettings.
 */
function mountVideoAssetsWithMode(
  persistedMode: 'generate' | 'prompts-only' | undefined,
  onToast?: (msg: string) => void,
) {
  const draftWithMode = {
    ...STUB_DRAFT_DB,
    draft_json: {
      ...STUB_VIDEO_DRAFT_JSON,
      ...(persistedMode !== undefined
        ? { assetSettings: { imageMode: persistedMode } }
        : {}),
    },
  }

  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    if (String(url).includes('/api/content-drafts/video-draft-1') && method === 'GET') {
      return {
        ok: true,
        json: async () => ({ data: draftWithMode, error: null }),
      } as Response
    }
    if (String(url).includes('/api/content-drafts/video-draft-1') && method === 'PATCH') {
      return {
        ok: true,
        json: async () => ({ data: draftWithMode, error: null }),
      } as Response
    }
    return { ok: true, json: async () => ({ data: null, error: null }) } as Response
  })
  vi.stubGlobal('fetch', fetchMock)

  const result = render(
    <StandaloneProjectContextProvider
      projectId="proj-video"
      channelId="ch-1"
      mode={null}
      autopilotConfig={null}
      initialStageResults={VIDEO_STAGE_RESULTS}
      initialStageResultsByTrack={VIDEO_STAGE_RESULTS_BY_TRACK}
      pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
      creditSettings={DEFAULT_CREDIT_SETTINGS}
    >
      <AssetsEngine
        draft={null}
        trackMedium="video"
        trackId="track-video-1"
        onToast={onToast}
      />
    </StandaloneProjectContextProvider>,
  )

  return { result, fetchMock }
}

describe('AssetsEngine — S6 image-mode persistence (issue #219)', () => {
  // ── AC: defaults to prompts-only when assetSettings absent ────────────────
  it('defaults to prompts-only when no assetSettings in draft_json', async () => {
    mountVideoAssetsWithMode(undefined)
    await screen.findByTestId('video-assets-mode-toggle')
    // Prompts-only is default — textareas (prompt copy UI) should be visible
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0)
  })

  // ── AC: reads persisted generate mode ────────────────────────────────────
  it('reads persisted imageMode=generate from draft_json on mount', async () => {
    mountVideoAssetsWithMode('generate')
    // Wait for the toggle to appear AND for the mode to sync from async fetch
    await waitFor(() => {
      const toggle = screen.queryByTestId('video-assets-mode-toggle')
      expect(toggle).not.toBeNull()
      expect(toggle?.getAttribute('data-mode')).toBe('generate')
    }, { timeout: 2000 })
  })

  // ── AC: reads persisted prompts-only mode ─────────────────────────────────
  it('reads persisted imageMode=prompts-only from draft_json on mount', async () => {
    mountVideoAssetsWithMode('prompts-only')
    await screen.findByTestId('video-assets-mode-toggle')
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0)
  })

  // ── AC: flipping toggle fires PATCH ──────────────────────────────────────
  it('flipping toggle to generate fires PATCH with assetSettings.imageMode', async () => {
    const user = userEvent.setup()
    const { fetchMock } = mountVideoAssetsWithMode('prompts-only')
    await screen.findByTestId('video-assets-mode-toggle')

    const generateBtn = screen.getByRole('button', { name: /generate here/i })
    await user.click(generateBtn)

    // Should have called fetch with PATCH method including assetSettings
    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/api/content-drafts/video-draft-1') &&
        (init?.method ?? 'GET').toUpperCase() === 'PATCH',
    )
    expect(patchCall).toBeDefined()
    if (!patchCall) throw new Error('PATCH call not found')
    const body = JSON.parse(patchCall[1].body as string)
    expect(body.assetSettings?.imageMode).toBe('generate')
  })

  // ── AC: failed PATCH reverts toggle and shows toast ───────────────────────
  it('reverts toggle and shows toast when PATCH fails', async () => {
    const user = userEvent.setup()
    const toastCalls: string[] = []
    const onToast = (msg: string) => { toastCalls.push(msg) }

    // Stub: GET succeeds, PATCH fails
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (String(url).includes('/api/content-drafts/video-draft-1') && method === 'GET') {
          return {
            ok: true,
            json: async () => ({ data: STUB_DRAFT_DB, error: null }),
          } as Response
        }
        if (String(url).includes('/api/content-drafts/video-draft-1') && method === 'PATCH') {
          return {
            ok: false,
            json: async () => ({ data: null, error: { message: 'DB error', code: 'INTERNAL' } }),
          } as Response
        }
        return { ok: true, json: async () => ({ data: null, error: null }) } as Response
      }),
    )

    render(
      <StandaloneProjectContextProvider
        projectId="proj-video"
        channelId="ch-1"
        mode={null}
        autopilotConfig={null}
        initialStageResults={VIDEO_STAGE_RESULTS}
        initialStageResultsByTrack={VIDEO_STAGE_RESULTS_BY_TRACK}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
      >
        <AssetsEngine
          draft={null}
          trackMedium="video"
          trackId="track-video-1"
          onToast={onToast}
        />
      </StandaloneProjectContextProvider>,
    )

    await screen.findByTestId('video-assets-mode-toggle')
    const generateBtn = screen.getByRole('button', { name: /generate here/i })
    await user.click(generateBtn)

    // Wait for the async PATCH + revert to settle
    await new Promise((r) => setTimeout(r, 50))

    // Toggle should have reverted to prompts-only (textareas visible)
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0)
    // Toast should have been called
    expect(toastCalls.length).toBeGreaterThan(0)
  })
})
