import { describe, it, expect } from 'vitest'
import {
  deriveStageResultsByTrack,
  getTrackStageResults,
  LEGACY_TRACK_KEY,
  type StageRunPayload,
} from '../stage-results-by-track'

function run(overrides: Partial<StageRunPayload> = {}): StageRunPayload {
  return {
    id: 'r-' + Math.random().toString(36).slice(2, 8),
    projectId: 'p1',
    stage: 'brainstorm',
    status: 'completed',
    attemptNo: 1,
    finishedAt: '2026-05-22T10:00:00Z',
    errorMessage: null,
    outcomeJson: {},
    payloadRef: null,
    trackId: null,
    publishTargetId: null,
    ...overrides,
  }
}

describe('deriveStageResultsByTrack', () => {
  it('places brainstorm + research in shared (project-scoped, not per-track)', () => {
    const map = deriveStageResultsByTrack([
      run({ stage: 'brainstorm', outcomeJson: { ideaId: 'i1', ideaTitle: 'Hello' } }),
      run({ stage: 'research', outcomeJson: { researchSessionId: 'rs1', approvedCardsCount: 3 } }),
    ])

    expect(map.shared.brainstorm?.ideaId).toBe('i1')
    expect(map.shared.research?.researchSessionId).toBe('rs1')
    expect(map.tracks).toEqual({})
  })

  it('routes per-track stage runs to separate track buckets (no first-writer-wins)', () => {
    const draftBlog = run({
      stage: 'draft',
      trackId: 't-blog',
      payloadRef: { kind: 'content_draft', id: 'draft-blog' },
      outcomeJson: { draftId: 'draft-blog', draftTitle: 'Blog' },
    })
    const draftVideo = run({
      stage: 'draft',
      trackId: 't-video',
      payloadRef: { kind: 'content_draft', id: 'draft-video' },
      outcomeJson: { draftId: 'draft-video', draftTitle: 'Video' },
    })

    const map = deriveStageResultsByTrack([draftBlog, draftVideo])

    expect(map.tracks['t-blog']?.draft?.draftId).toBe('draft-blog')
    expect(map.tracks['t-video']?.draft?.draftId).toBe('draft-video')
  })

  it('routes per-track runs without trackId to the LEGACY_TRACK_KEY bucket', () => {
    const map = deriveStageResultsByTrack([
      run({
        stage: 'draft',
        trackId: null,
        payloadRef: { kind: 'content_draft', id: 'draft-legacy' },
        outcomeJson: { draftId: 'draft-legacy' },
      }),
    ])

    expect(map.tracks[LEGACY_TRACK_KEY]?.draft?.draftId).toBe('draft-legacy')
  })
})

describe('getTrackStageResults', () => {
  const sampleMap = deriveStageResultsByTrack([
    run({
      stage: 'draft',
      trackId: 't-blog',
      payloadRef: { kind: 'content_draft', id: 'draft-blog' },
      outcomeJson: { draftId: 'draft-blog' },
    }),
    run({
      stage: 'draft',
      trackId: null,
      payloadRef: { kind: 'content_draft', id: 'draft-legacy' },
      outcomeJson: { draftId: 'draft-legacy' },
    }),
  ])

  it('returns the bucket for a known trackId', () => {
    expect(getTrackStageResults(sampleMap, 't-blog').draft?.draftId).toBe('draft-blog')
  })

  it('returns the legacy bucket when trackId is null', () => {
    expect(getTrackStageResults(sampleMap, null).draft?.draftId).toBe('draft-legacy')
  })

  it('returns an empty object for an unknown trackId (no fallback to legacy)', () => {
    expect(getTrackStageResults(sampleMap, 't-unknown')).toEqual({})
  })
})

describe('deriveStageResultsByTrack — downstream stages', () => {
  it('routes review/assets/preview/publish per-track without bleeding across tracks', () => {
    const map = deriveStageResultsByTrack([
      run({
        stage: 'review',
        trackId: 't-blog',
        outcomeJson: { score: 92, verdict: 'approved' },
      }),
      run({
        stage: 'review',
        trackId: 't-video',
        outcomeJson: { score: 70, verdict: 'revision_required' },
      }),
      run({
        stage: 'assets',
        trackId: 't-blog',
        outcomeJson: { assetIds: ['a1'], featuredImageUrl: 'https://x/img.jpg' },
      }),
      run({
        stage: 'preview',
        trackId: 't-video',
        outcomeJson: { composedHtml: '<p>video preview</p>' },
      }),
      run({
        stage: 'publish',
        trackId: 't-blog',
        outcomeJson: { wordpressPostId: 42, publishedUrl: 'https://x/blog' },
      }),
    ])

    expect(map.tracks['t-blog']?.review?.score).toBe(92)
    expect(map.tracks['t-video']?.review?.score).toBe(70)
    expect(map.tracks['t-blog']?.assets?.assetIds).toEqual(['a1'])
    expect(map.tracks['t-video']?.assets).toBeUndefined()
    expect(map.tracks['t-video']?.preview?.composedHtml).toBe('<p>video preview</p>')
    expect(map.tracks['t-blog']?.preview).toBeUndefined()
    expect(map.tracks['t-blog']?.publish?.wordpressPostId).toBe(42)
    expect(map.tracks['t-video']?.publish).toBeUndefined()
  })
})
