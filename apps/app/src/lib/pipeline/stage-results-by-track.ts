import type {
  BrainstormResult,
  ResearchResult,
  DraftResult,
  ReviewResult,
  AssetsResult,
  PreviewResult,
  PublishResult,
} from '@/components/engines/types'

export const LEGACY_TRACK_KEY = '__legacy__'

export interface StageRunPayload {
  id: string
  projectId: string
  stage: string
  status: string
  attemptNo: number
  finishedAt: string | null
  errorMessage: string | null
  outcomeJson: Record<string, unknown> | null
  payloadRef: { kind?: string; id?: string } | null
  trackId: string | null
  publishTargetId: string | null
}

export interface SharedStageResults {
  brainstorm?: BrainstormResult & { completedAt: string }
  research?: ResearchResult & { completedAt: string }
}

export interface TrackStageResults {
  draft?: DraftResult & { completedAt: string }
  review?: ReviewResult & { completedAt: string }
  assets?: AssetsResult & { completedAt: string }
  preview?: PreviewResult & { completedAt: string }
  publish?: PublishResult & { completedAt: string }
}

export interface StageResultsByTrack {
  shared: SharedStageResults
  tracks: Record<string, TrackStageResults>
}

function ensureTrackBucket(
  tracks: Record<string, TrackStageResults>,
  key: string,
): TrackStageResults {
  if (!tracks[key]) tracks[key] = {}
  return tracks[key]
}

export function deriveStageResultsByTrack(runs: StageRunPayload[]): StageResultsByTrack {
  const shared: SharedStageResults = {}
  const tracks: Record<string, TrackStageResults> = {}
  for (const run of runs) {
    if (run.status !== 'completed') continue
    const hasPayloadRefFallback =
      (run.stage === 'canonical' || run.stage === 'production' || run.stage === 'draft') &&
      run.payloadRef?.kind === 'content_draft' &&
      typeof run.payloadRef.id === 'string'
    if (!run.outcomeJson && !hasPayloadRefFallback) continue
    const o = (run.outcomeJson ?? {}) as Record<string, unknown>
    const completedAt = run.finishedAt ?? new Date().toISOString()
    if (run.stage === 'brainstorm') {
      shared.brainstorm = {
        ideaId: (o.ideaId as string) ?? '',
        ideaTitle: (o.ideaTitle as string) ?? '',
        ideaVerdict: (o.ideaVerdict as string) ?? '',
        ideaCoreTension: (o.ideaCoreTension as string) ?? '',
        brainstormSessionId: o.brainstormSessionId as string | undefined,
        completedAt,
      } satisfies BrainstormResult & { completedAt: string }
    } else if (run.stage === 'research') {
      shared.research = {
        researchSessionId: (o.researchSessionId as string) ?? '',
        approvedCardsCount: (o.approvedCardsCount as number) ?? 0,
        researchLevel: (o.researchLevel as string) ?? '',
        primaryKeyword: o.primaryKeyword as string | undefined,
        secondaryKeywords: o.secondaryKeywords as string[] | undefined,
        searchIntent: o.searchIntent as string | undefined,
        confidenceScore: o.confidenceScore as number | undefined,
        evidenceStrength: o.evidenceStrength as string | undefined,
        sourceCount: o.sourceCount as number | undefined,
        expertQuoteCount: o.expertQuoteCount as number | undefined,
        researchSummary: o.researchSummary as string | undefined,
        pivotRecommendation: o.pivotRecommendation as string | undefined,
        completedAt,
      } satisfies ResearchResult & { completedAt: string }
    } else if (
      run.stage === 'draft' ||
      run.stage === 'canonical' ||
      run.stage === 'production'
    ) {
      const key = run.trackId ?? LEGACY_TRACK_KEY
      const bucket = ensureTrackBucket(tracks, key)
      const draftIdFromOutcome = typeof o.draftId === 'string' ? (o.draftId as string) : null
      const draftIdFromRef =
        run.payloadRef?.kind === 'content_draft' && typeof run.payloadRef.id === 'string'
          ? run.payloadRef.id
          : null
      const resolvedDraftId = draftIdFromOutcome ?? draftIdFromRef
      if (resolvedDraftId && !bucket.draft) {
        bucket.draft = {
          draftId: resolvedDraftId,
          draftTitle: (o.draftTitle as string) ?? '',
          draftContent: (o.draftContent as string) ?? '',
          personaId: o.personaId as string | undefined,
          personaName: o.personaName as string | undefined,
          personaSlug: o.personaSlug as string | undefined,
          personaWpAuthorId: o.personaWpAuthorId as number | null | undefined,
          completedAt,
        } satisfies DraftResult & { completedAt: string }
      }
    } else if (run.stage === 'review') {
      const bucket = ensureTrackBucket(tracks, run.trackId ?? LEGACY_TRACK_KEY)
      bucket.review = {
        score: (o.score as number) ?? 0,
        qualityTier: o.qualityTier as string | undefined,
        verdict: (o.verdict as string) ?? '',
        feedbackJson: (o.feedbackJson as Record<string, unknown>) ?? {},
        iterationCount: (o.iterationCount as number) ?? run.attemptNo,
        completedAt,
      } satisfies ReviewResult & { completedAt: string }
    } else if (run.stage === 'assets') {
      const bucket = ensureTrackBucket(tracks, run.trackId ?? LEGACY_TRACK_KEY)
      bucket.assets = {
        assetIds: (o.assetIds as string[]) ?? [],
        featuredImageUrl: o.featuredImageUrl as string | undefined,
        skipped: o.skipped as boolean | undefined,
        errorCode: o.errorCode as string | undefined,
        errorMessage: o.errorMessage as string | undefined,
        completedAt,
      } satisfies AssetsResult & { completedAt: string }
    } else if (run.stage === 'preview') {
      const bucket = ensureTrackBucket(tracks, run.trackId ?? LEGACY_TRACK_KEY)
      bucket.preview = {
        imageMap: (o.imageMap as Record<string, string>) ?? {},
        altTexts: (o.altTexts as Record<string, string>) ?? {},
        categories: (o.categories as string[]) ?? [],
        tags: (o.tags as string[]) ?? [],
        seoOverrides:
          (o.seoOverrides as { title: string; slug: string; metaDescription: string }) ?? {
            title: '',
            slug: '',
            metaDescription: '',
          },
        suggestedPublishDate: o.suggestedPublishDate as string | undefined,
        composedHtml: (o.composedHtml as string) ?? '',
        autoDerived: o.autoDerived as boolean | undefined,
        completedAt,
      } satisfies PreviewResult & { completedAt: string }
    } else if (run.stage === 'publish') {
      const bucket = ensureTrackBucket(tracks, run.trackId ?? LEGACY_TRACK_KEY)
      bucket.publish = {
        wordpressPostId: (o.wordpressPostId as number) ?? 0,
        publishedUrl: (o.publishedUrl as string) ?? '',
        completedAt,
      } satisfies PublishResult & { completedAt: string }
    }
  }
  return { shared, tracks }
}

export function getTrackStageResults(
  map: StageResultsByTrack,
  trackId: string | null,
): TrackStageResults {
  const key = trackId ?? LEGACY_TRACK_KEY
  return map.tracks[key] ?? {}
}
