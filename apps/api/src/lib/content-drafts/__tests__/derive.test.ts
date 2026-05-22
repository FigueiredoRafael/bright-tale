import { describe, it, expect } from 'vitest'
import { deriveDraft } from '../derive'

type Row = Record<string, unknown>

interface FakeDb {
  contentDrafts: Row[]
  tracks: Row[]
}

function mkSb(db: FakeDb) {
  const inserts: Row[] = []
  const sb = {
    inserts,
    from(table: string) {
      if (table === 'content_drafts') {
        return {
          select: (_cols: string) => ({
            eq: (col: string, val: unknown) => ({
              eq: (col2: string, val2: unknown) => ({
                maybeSingle: async () => {
                  const match = db.contentDrafts.find(
                    (r) => r[col] === val && r[col2] === val2,
                  )
                  return { data: match ?? null, error: null }
                },
              }),
              maybeSingle: async () => {
                const match = db.contentDrafts.find((r) => r[col] === val)
                return { data: match ?? null, error: null }
              },
            }),
          }),
          insert: (row: Row) => ({
            select: (_cols: string) => ({
              single: async () => {
                const created = { ...row, id: 'derived-' + (inserts.length + 1) }
                inserts.push(created)
                db.contentDrafts.push(created)
                return { data: created, error: null }
              },
            }),
          }),
        }
      }
      if (table === 'tracks') {
        return {
          select: (_cols: string) => ({
            eq: (col: string, val: unknown) => ({
              maybeSingle: async () => {
                const match = db.tracks.find((r) => r[col] === val)
                return { data: match ?? null, error: null }
              },
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return sb as any
}

const canonicalSource = {
  id: 'src-1',
  user_id: 'u1',
  project_id: 'p1',
  org_id: 'org-1',
  channel_id: 'ch-1',
  idea_id: 'idea-1',
  research_session_id: 'rs-1',
  persona_id: 'persona-1',
  title: 'Hello world',
  canonical_core_json: { topic: 'hello' },
  type: 'blog',
  track_id: null,
  draft_json: { body: 'something' },
  status: 'in_review',
}

describe('deriveDraft', () => {
  it('creates a new row when no (project, track) pair exists yet', async () => {
    const db: FakeDb = {
      contentDrafts: [{ ...canonicalSource }],
      tracks: [{ id: 't-video', project_id: 'p1', medium: 'video' }],
    }
    const sb = mkSb(db)

    const result = await deriveDraft(sb, {
      sourceId: 'src-1',
      trackId: 't-video',
      medium: 'video',
      userId: 'u1',
    })

    expect(result.created).toBe(true)
    expect(result.id).toBeTruthy()

    const inserted = sb.inserts[0]
    expect(inserted.project_id).toBe('p1')
    expect(inserted.track_id).toBe('t-video')
    expect(inserted.type).toBe('video')
    expect(inserted.canonical_core_json).toEqual({ topic: 'hello' })
    expect(inserted.title).toBe('Hello world')
    expect(inserted.persona_id).toBe('persona-1')
    expect(inserted.idea_id).toBe('idea-1')
    expect(inserted.research_session_id).toBe('rs-1')
    expect(inserted.channel_id).toBe('ch-1')
    expect(inserted.org_id).toBe('org-1')
    expect(inserted.user_id).toBe('u1')
  })

  it('is idempotent — returns the existing row when (project, track) already exists', async () => {
    const existing = {
      id: 'existing-1',
      user_id: 'u1',
      project_id: 'p1',
      track_id: 't-video',
      type: 'video',
      status: 'in_review',
    }
    const db: FakeDb = {
      contentDrafts: [{ ...canonicalSource }, existing],
      tracks: [{ id: 't-video', project_id: 'p1', medium: 'video' }],
    }
    const sb = mkSb(db)

    const result = await deriveDraft(sb, {
      sourceId: 'src-1',
      trackId: 't-video',
      medium: 'video',
      userId: 'u1',
    })

    expect(result.id).toBe('existing-1')
    expect(result.created).toBe(false)
    expect(sb.inserts).toHaveLength(0)
  })

  it('throws 404 when source does not exist', async () => {
    const sb = mkSb({
      contentDrafts: [],
      tracks: [{ id: 't-video', project_id: 'p1', medium: 'video' }],
    })

    await expect(
      deriveDraft(sb, { sourceId: 'missing', trackId: 't-video', medium: 'video', userId: 'u1' }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('throws 403 when source is not owned by the user', async () => {
    const sb = mkSb({
      contentDrafts: [{ ...canonicalSource, user_id: 'someone-else' }],
      tracks: [{ id: 't-video', project_id: 'p1', medium: 'video' }],
    })

    await expect(
      deriveDraft(sb, { sourceId: 'src-1', trackId: 't-video', medium: 'video', userId: 'u1' }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('throws 409 when track does not belong to the source project', async () => {
    const sb = mkSb({
      contentDrafts: [{ ...canonicalSource }],
      tracks: [{ id: 't-video', project_id: 'other-project', medium: 'video' }],
    })

    await expect(
      deriveDraft(sb, { sourceId: 'src-1', trackId: 't-video', medium: 'video', userId: 'u1' }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('initializes derived row with empty draft_json and status="draft"', async () => {
    const db: FakeDb = {
      contentDrafts: [{ ...canonicalSource }],
      tracks: [{ id: 't-video', project_id: 'p1', medium: 'video' }],
    }
    const sb = mkSb(db)

    await deriveDraft(sb, {
      sourceId: 'src-1',
      trackId: 't-video',
      medium: 'video',
      userId: 'u1',
    })

    const inserted = sb.inserts[0]
    expect(inserted.draft_json).toEqual({})
    expect(inserted.status).toBe('draft')
  })
})
