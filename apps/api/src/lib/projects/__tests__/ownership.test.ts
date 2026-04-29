import { describe, it, expect } from 'vitest'
import { assertProjectOwner } from '../ownership'
import { ApiError } from '../../api/errors'

function mkSb(rows: { project: any; channel?: any; research?: any }) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'projects')          return { data: rows.project, error: null }
            if (table === 'channels')          return { data: rows.channel ?? null, error: null }
            if (table === 'research_archives') return { data: rows.research ?? null, error: null }
            return { data: null, error: null }
          },
        }),
      }),
    }),
  } as any
}

describe('assertProjectOwner', () => {
  it('passes via channel ownership', async () => {
    const sb = mkSb({ project: { channel_id: 'c1', research_id: null }, channel: { user_id: 'u1' } })
    await expect(assertProjectOwner('p1', 'u1', sb)).resolves.toBeUndefined()
  })

  it('falls back to research_archives.user_id when channel_id is NULL', async () => {
    const sb = mkSb({ project: { channel_id: null, research_id: 'r1' }, research: { user_id: 'u1' } })
    await expect(assertProjectOwner('p1', 'u1', sb)).resolves.toBeUndefined()
  })

  it('throws 404 when project missing', async () => {
    const sb = mkSb({ project: null })
    await expect(assertProjectOwner('p1', 'u1', sb)).rejects.toMatchObject({ status: 404 })
  })

  it('throws 403 when neither chain matches', async () => {
    const sb = mkSb({ project: { channel_id: 'c1', research_id: null }, channel: { user_id: 'someone-else' } })
    await expect(assertProjectOwner('p1', 'u1', sb)).rejects.toMatchObject({ status: 403 })
  })
})
