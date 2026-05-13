import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

// ── Supabase mock ────────────────────────────────────────────────────────────

const mockFrom = vi.fn()

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}))

vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: (_req: unknown, _rep: unknown, done: () => void) => done(),
}))

vi.mock('../../lib/crypto.js', () => ({
  decrypt: vi.fn().mockReturnValue('plain-password'),
}))

vi.mock('../../lib/image/webp.js', () => ({
  convertToWebP: vi.fn().mockResolvedValue(Buffer.from('webp-image-data')),
}))

const { mockMkdirSync, mockWriteFileSync, mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockMkdirSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}))

vi.mock('fs', () => ({
  default: {
    mkdirSync: mockMkdirSync,
    writeFileSync: mockWriteFileSync,
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  },
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}))

import { personasRoutes } from '../personas.js'
import { convertToWebP } from '../../lib/image/webp.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PERSONA_DB = {
  id: 'uuid-1',
  slug: 'cole-merritt',
  name: 'Cole Merritt',
  avatar_url: null as string | null,
  bio_short: 'Building in public.',
  bio_long: 'Long bio here.',
  primary_domain: 'B2B entrepreneurship',
  domain_lens: 'Inside the build.',
  approved_categories: ['Entrepreneurship', 'B2B'],
  writing_voice_json: { writingStyle: 'Blunt', signaturePhrases: [], characteristicOpinions: [] },
  eeat_signals_json: { analyticalLens: 'Builder lens', trustSignals: [], expertiseClaims: [] },
  soul_json: {
    values: [], lifePhilosophy: '', strongOpinions: [], petPeeves: [],
    humorStyle: '', recurringJokes: [], whatExcites: [], innerTensions: [], languageGuardrails: [],
  },
  wp_author_id: null,
  is_active: true,
  archetype_slug: null,
  avatar_params_json: null,
  created_at: '2026-04-23T00:00:00Z',
  updated_at: '2026-04-23T00:00:00Z',
}

const WP_CONFIG = {
  site_url: 'https://wp.test',
  username: 'admin',
  password: 'encrypted-pw',
}

const CHANNEL_ID = '11111111-1111-1111-1111-111111111111'

// ── Mock chain factory ────────────────────────────────────────────────────────
// The chain is thenable: awaiting it directly resolves to `chainValue`.
// Terminal calls (single / maybeSingle) resolve via their own mocks.

let chainValue: { data: unknown; error: unknown }

function createChain() {
  const chain: Record<string, unknown> = {
    select:     vi.fn().mockReturnThis(),
    eq:         vi.fn().mockReturnThis(),
    order:      vi.fn().mockReturnThis(),
    limit:      vi.fn().mockReturnThis(),
    insert:     vi.fn().mockReturnThis(),
    update:     vi.fn().mockReturnThis(),
    upsert:     vi.fn().mockReturnThis(),
    single:     vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
      return Promise.resolve(chainValue).then(res, rej)
    },
    catch(rej: (e: unknown) => unknown) {
      return Promise.resolve(chainValue).catch(rej)
    },
  }
  // Every fluent method returns the same chain object
  ;(chain.select as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  ;(chain.eq as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  ;(chain.order as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  ;(chain.limit as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  ;(chain.insert as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  ;(chain.update as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  ;(chain.upsert as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  return chain
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('personas routes', () => {
  let app: FastifyInstance
  let chain: ReturnType<typeof createChain>

  beforeEach(async () => {
    vi.clearAllMocks()
    chainValue = { data: null, error: null }

    chain = createChain()
    mockFrom.mockReturnValue(chain)

    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockReturnValue(Buffer.from('fake-image'))
    vi.mocked(convertToWebP).mockResolvedValue(Buffer.from('webp-image-data'))

    app = Fastify()

    // Mirror the production error handler so ApiErrors pass through with correct
    // status code and { data, error } envelope (same logic as apps/api/src/index.ts)
    app.setErrorHandler((err, _request, reply) => {
      if (err.name === 'ApiError') {
        const e = err as unknown as { status: number; code?: string; message: string }
        return reply.status(e.status).send({ data: null, error: { code: e.code ?? 'ERROR', message: e.message } })
      }
      const sc = typeof (err as { statusCode?: number }).statusCode === 'number'
        ? (err as { statusCode: number }).statusCode : 500
      const status = sc >= 400 && sc < 600 ? sc : 500
      const match = [
        { test: /ZodError|validation/i, code: 'VALIDATION_ERROR', safeMessage: 'Invalid input' },
      ].find(m => m.test.test(err.message ?? '') || m.test.test(err.name ?? ''))
      const code = match?.code ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST')
      const message = match?.safeMessage ?? (status >= 500 ? 'Internal server error' : 'Request failed')
      return reply.status(status).send({ data: null, error: { code, message } })
    })

    await app.register(personasRoutes, { prefix: '/personas' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    vi.unstubAllGlobals()
  })

  // ── GET /personas ───────────────────────────────────────────────────────────

  describe('GET /personas', () => {
    it('returns only active personas', async () => {
      chainValue = { data: [PERSONA_DB], error: null }

      const res = await app.inject({ method: 'GET', url: '/personas' })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.error).toBeNull()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].slug).toBe('cole-merritt')
      expect(chain.eq).toHaveBeenCalledWith('is_active', true)
    })

    it('returns empty array when no active personas exist', async () => {
      chainValue = { data: [], error: null }

      const res = await app.inject({ method: 'GET', url: '/personas' })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data).toEqual([])
    })
  })

  // ── GET /personas/:id ───────────────────────────────────────────────────────

  describe('GET /personas/:id', () => {
    it('returns 404 when persona not found', async () => {
      vi.mocked(chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: null, error: null })

      const res = await app.inject({ method: 'GET', url: '/personas/uuid-999' })

      expect(res.statusCode).toBe(404)
    })

    it('returns persona when found', async () => {
      vi.mocked(chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: PERSONA_DB, error: null })

      const res = await app.inject({ method: 'GET', url: '/personas/uuid-1' })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data.slug).toBe('cole-merritt')
    })
  })

  // ── PATCH /personas/:id ─────────────────────────────────────────────────────

  describe('PATCH /personas/:id (toggle active)', () => {
    it('flips is_active to false and returns updated persona', async () => {
      vi.mocked(chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { ...PERSONA_DB, is_active: false },
        error: null,
      })

      const res = await app.inject({
        method: 'PATCH',
        url: '/personas/uuid-1',
        payload: { isActive: false },
      })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data.isActive).toBe(false)
      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }))
    })
  })

  // ── POST /personas/:id/avatar/upload ────────────────────────────────────────

  describe('POST /personas/:id/avatar/upload', () => {
    const PNG_DATA_URL = `data:image/png;base64,${Buffer.from('fake-png-bytes').toString('base64')}`

    it('returns VALIDATION_ERROR for a malformed data URL', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/personas/uuid-1/avatar/upload',
        payload: { dataUrl: 'not-a-data-url' },
      })

      // ZodError has no 4xx statusCode, so the error handler produces 500 with VALIDATION_ERROR code
      expect(res.statusCode).toBe(500)
      expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR')
    })

    it('converts image to WebP and saves the WebP buffer', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/personas/uuid-1/avatar/upload',
        payload: { dataUrl: PNG_DATA_URL },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.error).toBeNull()
      expect(body.data.avatarUrl).toMatch(/\/generated-images\/avatars\/uuid-1-\d+\.webp$/)
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('uuid-1'),
        Buffer.from('webp-image-data'),
      )
    })

    it('calls convertToWebP with the decoded raw image buffer at quality 80', async () => {
      const imageBytes = Buffer.from('raw-image-content')
      const dataUrl = `data:image/png;base64,${imageBytes.toString('base64')}`

      await app.inject({
        method: 'POST',
        url: '/personas/uuid-1/avatar/upload',
        payload: { dataUrl },
      })

      expect(vi.mocked(convertToWebP)).toHaveBeenCalledWith(imageBytes, 80)
    })

    it('falls back to original format when WebP conversion returns null', async () => {
      vi.mocked(convertToWebP).mockResolvedValueOnce(null)

      const res = await app.inject({
        method: 'POST',
        url: '/personas/uuid-1/avatar/upload',
        payload: { dataUrl: PNG_DATA_URL },
      })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data.avatarUrl).toMatch(/\.png$/)
    })

    it('persists avatarUrl to DB immediately after file save', async () => {
      await app.inject({
        method: 'POST',
        url: '/personas/uuid-1/avatar/upload',
        payload: { dataUrl: PNG_DATA_URL },
      })

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ avatar_url: expect.stringContaining('/generated-images/avatars/uuid-1') }),
      )
    })
  })

  // ── POST /personas/:id/integrations/wordpress ───────────────────────────────

  describe('POST /personas/:id/integrations/wordpress', () => {
    function stubFetch(responses: Array<{ ok: boolean; json: () => Promise<unknown> }>) {
      const fetchMock = vi.fn()
      responses.forEach(r => fetchMock.mockResolvedValueOnce(r))
      vi.stubGlobal('fetch', fetchMock)
      return fetchMock
    }

    // Sets up the 4 sequential maybeSingle calls for the happy-path WP flow
    function setupHappyPathDb(personaOverride = PERSONA_DB) {
      vi.mocked(chain.maybeSingle as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: personaOverride, error: null })         // personas
        .mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null })    // org_memberships
        .mockResolvedValueOnce({ data: { id: CHANNEL_ID }, error: null })     // channels
        .mockResolvedValueOnce({ data: WP_CONFIG, error: null })              // wordpress_configs
    }

    describe('link action', () => {
      it('returns 404 when persona does not exist', async () => {
        vi.mocked(chain.maybeSingle as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ data: null, error: null })

        const res = await app.inject({
          method: 'POST',
          url: '/personas/uuid-1/integrations/wordpress',
          payload: { action: 'link', wpUsername: 'some-user', channelId: CHANNEL_ID },
        })

        expect(res.statusCode).toBe(404)
        expect(JSON.parse(res.body).error.code).toBe('PERSONA_NOT_FOUND')
      })

      it('returns 403 when requester has no org membership', async () => {
        vi.mocked(chain.maybeSingle as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ data: PERSONA_DB, error: null })
          .mockResolvedValueOnce({ data: null, error: null }) // no org

        const res = await app.inject({
          method: 'POST',
          url: '/personas/uuid-1/integrations/wordpress',
          payload: { action: 'link', wpUsername: 'some-user', channelId: CHANNEL_ID },
        })

        expect(res.statusCode).toBe(403)
      })

      it('returns 404 when channel does not belong to the org', async () => {
        vi.mocked(chain.maybeSingle as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ data: PERSONA_DB, error: null })
          .mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null })
          .mockResolvedValueOnce({ data: null, error: null }) // channel not found

        const res = await app.inject({
          method: 'POST',
          url: '/personas/uuid-1/integrations/wordpress',
          payload: { action: 'link', wpUsername: 'some-user', channelId: CHANNEL_ID },
        })

        expect(res.statusCode).toBe(404)
        expect(JSON.parse(res.body).error.code).toBe('CHANNEL_NOT_FOUND')
      })

      it('returns 400 when channel has no WordPress config', async () => {
        vi.mocked(chain.maybeSingle as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ data: PERSONA_DB, error: null })
          .mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null })
          .mockResolvedValueOnce({ data: { id: CHANNEL_ID }, error: null })
          .mockResolvedValueOnce({ data: null, error: null }) // no wp config

        const res = await app.inject({
          method: 'POST',
          url: '/personas/uuid-1/integrations/wordpress',
          payload: { action: 'link', wpUsername: 'some-user', channelId: CHANNEL_ID },
        })

        expect(res.statusCode).toBe(400)
        expect(JSON.parse(res.body).error.code).toBe('NO_WP_CONFIG')
      })

      it('returns 400 when wpUsername is missing for link action', async () => {
        setupHappyPathDb()
        stubFetch([])

        const res = await app.inject({
          method: 'POST',
          url: '/personas/uuid-1/integrations/wordpress',
          payload: { action: 'link', channelId: CHANNEL_ID }, // no wpUsername
        })

        expect(res.statusCode).toBe(400)
        expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR')
      })

      it('returns 502 when WP user search request fails', async () => {
        setupHappyPathDb()
        stubFetch([{ ok: false, json: async () => ({}) }])

        const res = await app.inject({
          method: 'POST',
          url: '/personas/uuid-1/integrations/wordpress',
          payload: { action: 'link', wpUsername: 'ghost-user', channelId: CHANNEL_ID },
        })

        expect(res.statusCode).toBe(502)
        expect(JSON.parse(res.body).error.code).toBe('WP_FETCH_ERROR')
      })

      it('returns 404 when no WP user matches the username', async () => {
        setupHappyPathDb()
        stubFetch([{ ok: true, json: async () => [] }]) // empty results

        const res = await app.inject({
          method: 'POST',
          url: '/personas/uuid-1/integrations/wordpress',
          payload: { action: 'link', wpUsername: 'nobody', channelId: CHANNEL_ID },
        })

        expect(res.statusCode).toBe(404)
        expect(JSON.parse(res.body).error.code).toBe('WP_USER_NOT_FOUND')
      })

      it('returns 200 with wpAuthorId when link succeeds', async () => {
        setupHappyPathDb()
        stubFetch([{ ok: true, json: async () => [{ id: 42, slug: 'cole-merritt', name: 'Cole Merritt' }] }])
        vi.mocked(chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          data: { ...PERSONA_DB, wp_author_id: 42 },
          error: null,
        })

        const res = await app.inject({
          method: 'POST',
          url: '/personas/uuid-1/integrations/wordpress',
          payload: { action: 'link', wpUsername: 'cole-merritt', channelId: CHANNEL_ID },
        })

        expect(res.statusCode).toBe(200)
        const body = JSON.parse(res.body)
        expect(body.error).toBeNull()
        expect(body.data.wpAuthorId).toBe(42)
        expect(chain.update).toHaveBeenCalledWith({ wp_author_id: 42 })
      })

      it('uploads avatar to WP media and sets profile picture when file exists', async () => {
        const personaWithAvatar = { ...PERSONA_DB, avatar_url: '/generated-images/avatars/uuid-1-999.png' }
        setupHappyPathDb(personaWithAvatar)
        mockExistsSync.mockReturnValue(true)

        const fetchMock = stubFetch([
          { ok: true, json: async () => [{ id: 7, slug: 'cole-merritt' }] },           // user search
          { ok: true, json: async () => ({ id: 99, source_url: 'https://wp.test/avatar.png' }) }, // media upload
          { ok: true, json: async () => ({}) },                                          // user meta
        ])
        vi.mocked(chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          data: { ...personaWithAvatar, wp_author_id: 7 },
          error: null,
        })

        const res = await app.inject({
          method: 'POST',
          url: '/personas/uuid-1/integrations/wordpress',
          payload: { action: 'link', wpUsername: 'cole-merritt', channelId: CHANNEL_ID },
        })

        expect(res.statusCode).toBe(200)
        expect(fetchMock).toHaveBeenCalledTimes(3)
        expect(fetchMock.mock.calls[1][0]).toContain('/wp-json/wp/v2/media')
        // Third call sets wp_user_avatar meta
        const metaBody = JSON.parse(fetchMock.mock.calls[2][1].body)
        expect(metaBody.meta.wp_user_avatar).toBe(99) // must be integer, not string
      })

      it('returns 200 even when avatar sync throws (non-fatal)', async () => {
        const personaWithAvatar = { ...PERSONA_DB, avatar_url: '/generated-images/avatars/uuid-1-999.png' }
        setupHappyPathDb(personaWithAvatar)
        mockExistsSync.mockReturnValue(true)

        const fetchMock = vi.fn()
        fetchMock
          .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 7, slug: 'cole-merritt' }] })
          .mockRejectedValueOnce(new Error('media upload network error'))
        vi.stubGlobal('fetch', fetchMock)

        vi.mocked(chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          data: { ...personaWithAvatar, wp_author_id: 7 },
          error: null,
        })

        const res = await app.inject({
          method: 'POST',
          url: '/personas/uuid-1/integrations/wordpress',
          payload: { action: 'link', wpUsername: 'cole-merritt', channelId: CHANNEL_ID },
        })

        expect(res.statusCode).toBe(200)
        expect(JSON.parse(res.body).data.wpAuthorId).toBe(7)
      })
    })

    describe('create action', () => {
      it('creates WP author with bio description and author role', async () => {
        setupHappyPathDb()
        const fetchMock = stubFetch([{ ok: true, json: async () => ({ id: 55 }) }])
        vi.mocked(chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          data: { ...PERSONA_DB, wp_author_id: 55 },
          error: null,
        })

        const res = await app.inject({
          method: 'POST',
          url: '/personas/uuid-1/integrations/wordpress',
          payload: { action: 'create', channelId: CHANNEL_ID },
        })

        expect(res.statusCode).toBe(200)
        expect(JSON.parse(res.body).data.wpAuthorId).toBe(55)

        const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
        expect(requestBody.description).toBe('Building in public.')
        expect(requestBody.roles).toEqual(['author'])
        expect(requestBody.username).toBe('cole-merritt')
      })

      it('returns 502 with WP error message when user creation fails', async () => {
        setupHappyPathDb()
        stubFetch([{ ok: false, json: async () => ({ message: 'Username already exists.' }) }])

        const res = await app.inject({
          method: 'POST',
          url: '/personas/uuid-1/integrations/wordpress',
          payload: { action: 'create', channelId: CHANNEL_ID },
        })

        expect(res.statusCode).toBe(502)
        const body = JSON.parse(res.body)
        expect(body.error.code).toBe('WP_CREATE_ERROR')
        expect(body.error.message).toBe('Username already exists.')
      })
    })
  })

  // ── DELETE /personas/:id/integrations/wordpress ─────────────────────────────

  describe('DELETE /personas/:id/integrations/wordpress', () => {
    it('sets wp_author_id to null and returns the updated persona', async () => {
      vi.mocked(chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { ...PERSONA_DB, wp_author_id: null },
        error: null,
      })

      const res = await app.inject({
        method: 'DELETE',
        url: '/personas/uuid-1/integrations/wordpress',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.error).toBeNull()
      expect(body.data.persona.wpAuthorId).toBeNull()
      expect(chain.update).toHaveBeenCalledWith({ wp_author_id: null })
    })

    it('returns 500 when the DB update fails', async () => {
      vi.mocked(chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: null,
        error: { message: 'connection refused', code: 'XX000' },
      })

      const res = await app.inject({
        method: 'DELETE',
        url: '/personas/uuid-1/integrations/wordpress',
      })

      expect(res.statusCode).toBe(500)
      expect(JSON.parse(res.body).error.code).toBe('PERSONA_UPDATE_ERROR')
    })
  })

  // ── PUT /personas/:id — WordPress profile sync ──────────────────────────────

  describe('PUT /personas/:id WordPress sync', () => {
    const PERSONA_WITH_WP = { ...PERSONA_DB, wp_author_id: 42 }

    function setupPutDb(personaData: Record<string, unknown> = PERSONA_WITH_WP) {
      vi.mocked(chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: personaData,
        error: null,
      })
    }

    function setupWpCreds() {
      vi.mocked(chain.maybeSingle as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: { channel_id: CHANNEL_ID }, error: null }) // channel_personas
        .mockResolvedValueOnce({ data: WP_CONFIG, error: null })                  // wordpress_configs
    }

    it('syncs name and bio to WP and returns wpSync.synced=true', async () => {
      setupPutDb()
      setupWpCreds()
      const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      vi.stubGlobal('fetch', fetchMock)

      const res = await app.inject({
        method: 'PUT',
        url: '/personas/uuid-1',
        payload: { name: 'Cole Merritt', bioShort: 'Building in public.' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.wpSync.synced).toBe(true)
      expect(body.data.wpSync.error).toBeUndefined()

      const wpCall = fetchMock.mock.calls[0]
      expect(wpCall[0]).toContain('/wp-json/wp/v2/users/42')
      const payload = JSON.parse(wpCall[1].body)
      expect(payload.name).toBe('Cole Merritt')
      expect(payload.description).toBe('Building in public.')
    })

    it('includes wpSync.synced=false with reason when persona has no linked channel', async () => {
      setupPutDb()
      vi.mocked(chain.maybeSingle as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: null, error: null }) // no channel_personas row

      const res = await app.inject({
        method: 'PUT',
        url: '/personas/uuid-1',
        payload: { name: 'Cole Merritt' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.wpSync.synced).toBe(false)
      expect(body.data.wpSync.error).toBeTruthy()
    })

    it('includes wpSync.synced=false when channel has no WP config', async () => {
      setupPutDb()
      vi.mocked(chain.maybeSingle as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: { channel_id: CHANNEL_ID }, error: null })
        .mockResolvedValueOnce({ data: null, error: null }) // no wordpress_config

      const res = await app.inject({
        method: 'PUT',
        url: '/personas/uuid-1',
        payload: { name: 'Cole Merritt' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.wpSync.synced).toBe(false)
      expect(body.data.wpSync.error).toBeTruthy()
    })

    it('includes wpSync.synced=false with WP error when WP user update fails', async () => {
      setupPutDb()
      setupWpCreds()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ message: 'Sorry, you are not allowed to edit this user.' }),
      }))

      const res = await app.inject({
        method: 'PUT',
        url: '/personas/uuid-1',
        payload: { name: 'Cole Merritt' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.wpSync.synced).toBe(false)
      expect(body.data.wpSync.error).toMatch(/403/)
    })

    it('skips WP sync and omits wpSync field when persona has no wp_author_id', async () => {
      setupPutDb({ ...PERSONA_DB, wp_author_id: null })

      const res = await app.inject({
        method: 'PUT',
        url: '/personas/uuid-1',
        payload: { name: 'Cole Merritt' },
      })

      expect(res.statusCode).toBe(200)
      // wpSync absent means no sync was attempted
      expect(JSON.parse(res.body).data.wpSync).toBeUndefined()
    })

    it('syncs updated avatar to WP when avatarUrl is included in the update', async () => {
      const personaWithAvatar = { ...PERSONA_WITH_WP, avatar_url: '/generated-images/avatars/uuid-1-999.webp' }
      vi.mocked(chain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: personaWithAvatar, error: null })
      setupWpCreds()
      mockExistsSync.mockReturnValue(true)

      const fetchMock = vi.fn()
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })               // profile update
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 77, source_url: 'https://wp.test/avatar.webp' }) }) // media upload
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })               // user meta
      vi.stubGlobal('fetch', fetchMock)

      const res = await app.inject({
        method: 'PUT',
        url: '/personas/uuid-1',
        payload: { name: 'Cole Merritt', avatarUrl: '/generated-images/avatars/uuid-1-999.webp' },
      })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data.wpSync.synced).toBe(true)
      // media upload should use integer id, not string
      const metaCall = fetchMock.mock.calls[2]
      expect(JSON.parse(metaCall[1].body).meta.wp_user_avatar).toBe(77)
    })
  })

  // ── POST /personas/:id/avatar/upload — WP sync ──────────────────────────────

  describe('POST /personas/:id/avatar/upload WordPress sync', () => {
    const PNG_DATA_URL = `data:image/png;base64,${Buffer.from('fake-png').toString('base64')}`
    const PERSONA_WITH_WP = { ...PERSONA_DB, wp_author_id: 42 }

    function setupUploadWpCreds() {
      vi.mocked(chain.maybeSingle as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: PERSONA_WITH_WP, error: null })            // personas select
        .mockResolvedValueOnce({ data: { channel_id: CHANNEL_ID }, error: null }) // channel_personas
        .mockResolvedValueOnce({ data: WP_CONFIG, error: null })                  // wordpress_configs
    }

    it('syncs avatar to WP after upload when persona has wp_author_id', async () => {
      setupUploadWpCreds()
      mockExistsSync.mockReturnValue(true)

      const fetchMock = vi.fn()
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 55, source_url: 'https://wp.test/up.webp' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      vi.stubGlobal('fetch', fetchMock)

      const res = await app.inject({
        method: 'POST',
        url: '/personas/uuid-1/avatar/upload',
        payload: { dataUrl: PNG_DATA_URL },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.avatarSynced).toBe(true)
      expect(body.data.avatarSyncError).toBeUndefined()
      // wp_user_avatar must be sent as integer
      const metaCall = fetchMock.mock.calls[1]
      expect(JSON.parse(metaCall[1].body).meta.wp_user_avatar).toBe(55)
    })

    it('returns avatarSynced=false when WP media upload fails during avatar upload', async () => {
      setupUploadWpCreds()
      mockExistsSync.mockReturnValue(true)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }),
      }))

      const res = await app.inject({
        method: 'POST',
        url: '/personas/uuid-1/avatar/upload',
        payload: { dataUrl: PNG_DATA_URL },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.avatarSynced).toBe(false)
      expect(body.data.avatarSyncError).toMatch(/401/)
    })

    it('returns avatarSynced=false when persona has no wp_author_id', async () => {
      vi.mocked(chain.maybeSingle as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: PERSONA_DB, error: null }) // no wp_author_id

      const res = await app.inject({
        method: 'POST',
        url: '/personas/uuid-1/avatar/upload',
        payload: { dataUrl: PNG_DATA_URL },
      })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data.avatarSynced).toBe(false)
    })
  })
})
