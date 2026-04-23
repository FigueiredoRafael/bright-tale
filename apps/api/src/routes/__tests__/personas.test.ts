import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockSingle = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockMaybeSingle = vi.fn()

const mockFrom = vi.fn(() => ({
  select: mockSelect.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  order: mockOrder.mockResolvedValue({ data: [], error: null }),
  single: mockSingle,
  maybeSingle: mockMaybeSingle,
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
}))

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}))

vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: (_req: unknown, _rep: unknown, done: () => void) => done(),
}))

import { personasRoutes } from '../personas.js'

const ACTIVE_PERSONA = {
  id: 'uuid-1',
  slug: 'cole-merritt',
  name: 'Cole Merritt',
  avatar_url: null,
  bio_short: 'Building in public.',
  bio_long: 'Long bio.',
  primary_domain: 'B2B entrepreneurship',
  domain_lens: 'Inside the build.',
  approved_categories: ['Entrepreneurship', 'B2B'],
  writing_voice_json: { writingStyle: 'Blunt', signaturePhrases: [], characteristicOpinions: [] },
  eeat_signals_json: { analyticalLens: 'Builder lens', trustSignals: [], expertiseClaims: [] },
  soul_json: { values: [], lifePhilosophy: '', strongOpinions: [], petPeeves: [], humorStyle: '', recurringJokes: [], whatExcites: [], innerTensions: [], languageGuardrails: [] },
  wp_author_id: null,
  is_active: true,
  created_at: '2026-04-23T00:00:00Z',
  updated_at: '2026-04-23T00:00:00Z',
}

describe('personas routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    app = Fastify()
    await app.register(personasRoutes, { prefix: '/personas' })
    await app.ready()
  })

  describe('GET /api/personas', () => {
    it('returns only active personas', async () => {
      mockOrder.mockResolvedValueOnce({ data: [ACTIVE_PERSONA], error: null })

      const res = await app.inject({ method: 'GET', url: '/personas' })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.error).toBeNull()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].slug).toBe('cole-merritt')
      expect(mockEq).toHaveBeenCalledWith('is_active', true)
    })

    it('returns empty array when no active personas', async () => {
      mockOrder.mockResolvedValueOnce({ data: [], error: null })

      const res = await app.inject({ method: 'GET', url: '/personas' })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data).toEqual([])
    })
  })

  describe('GET /api/personas/:id', () => {
    it('returns 404 when persona not found', async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

      const res = await app.inject({ method: 'GET', url: '/personas/uuid-999' })

      expect(res.statusCode).toBe(404)
    })

    it('returns persona when found', async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: ACTIVE_PERSONA, error: null })

      const res = await app.inject({ method: 'GET', url: '/personas/uuid-1' })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data.slug).toBe('cole-merritt')
    })
  })

  describe('PATCH /api/personas/:id (toggle)', () => {
    it('flips is_active to false', async () => {
      mockSingle.mockResolvedValueOnce({ data: { ...ACTIVE_PERSONA, is_active: false }, error: null })

      const res = await app.inject({
        method: 'PATCH',
        url: '/personas/uuid-1',
        payload: { isActive: false },
      })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data.isActive).toBe(false)
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }))
    })
  })
})
