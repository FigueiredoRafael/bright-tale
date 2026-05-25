/**
 * M-006 / M-008 — Support routes unit tests (Category A/B — no DB required)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------
const mockEq = vi.fn()
const mockIn = vi.fn()
const mockOrder = vi.fn()
const mockSingle = vi.fn()
const mockMaybeSingle = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockSelect = vi.fn()
const mockNeq = vi.fn()
const mockLimit = vi.fn()

function makeQueryChain() {
  const chain: Record<string, unknown> = {}
  chain.select = mockSelect.mockReturnValue(chain)
  chain.insert = mockInsert.mockReturnValue(chain)
  chain.update = mockUpdate.mockReturnValue(chain)
  chain.eq = mockEq.mockReturnValue(chain)
  chain.neq = mockNeq.mockReturnValue(chain)
  chain.in = mockIn.mockReturnValue(chain)
  chain.order = mockOrder.mockReturnValue(chain)
  chain.limit = mockLimit.mockReturnValue(chain)
  chain.single = mockSingle
  chain.maybeSingle = mockMaybeSingle
  return chain
}

const mockFrom = vi.fn(() => makeQueryChain())

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}))

// ---------------------------------------------------------------------------
// Middleware mocks — authenticated user by default
// ---------------------------------------------------------------------------
vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: vi.fn((req: { userId?: string }, _rep: unknown, done: () => void) => {
    req.userId = req.userId ?? 'user-123'
    done()
  }),
  authenticateWithUser: vi.fn((req: { userId?: string }, _rep: unknown, done: () => void) => {
    req.userId = req.userId ?? 'user-123'
    done()
  }),
}))

// ---------------------------------------------------------------------------
// Anthropic mock — simulate a simple text response
// ---------------------------------------------------------------------------
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Olá! Como posso ajudá-lo?' }],
          stop_reason: 'end_turn',
        }),
      }
    },
  }
})

import { supportRoutes } from '../support.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('support routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    app = Fastify()
    await app.register(supportRoutes, { prefix: '/support' })
    await app.ready()
  })

  // ── GET /support/threads/:threadId/messages ──────────────────────────────
  describe('GET /support/threads/:threadId/messages', () => {
    it('returns 404 when thread does not belong to user', async () => {
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: 'thread-1', user_id: 'other-user', status: 'open' },
        error: null,
      })

      const res = await app.inject({
        method: 'GET',
        url: '/support/threads/thread-1/messages',
      })

      expect(res.statusCode).toBe(404)
      const body = JSON.parse(res.body) as { error: { code: string } }
      expect(body.error.code).toBe('NOT_FOUND')
    })

    it('returns 404 when thread does not exist', async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

      const res = await app.inject({
        method: 'GET',
        url: '/support/threads/thread-999/messages',
      })

      expect(res.statusCode).toBe(404)
    })

    it('returns messages for valid thread owned by user', async () => {
      // Thread maybeSingle
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: 'thread-1', user_id: 'user-123', status: 'open', priority: null, created_at: '2026-05-01T00:00:00Z' },
        error: null,
      })
      // Messages order + mockReturnValue chain needs a final await resolution
      // The order call on message query returns { data, error } via the chain
      mockOrder.mockResolvedValueOnce({
        data: [
          { id: 'msg-1', thread_id: 'thread-1', role: 'user', content: 'Olá', created_at: '2026-05-01T00:00:01Z' },
          { id: 'msg-2', thread_id: 'thread-1', role: 'assistant', content: 'Oi!', created_at: '2026-05-01T00:00:02Z' },
        ],
        error: null,
      })

      const res = await app.inject({
        method: 'GET',
        url: '/support/threads/thread-1/messages',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body) as { data: { thread: unknown; messages: unknown[] }; error: null }
      expect(body.error).toBeNull()
      expect(body.data.messages).toHaveLength(2)
    })
  })

  // ── GET /support/admin/threads ────────────────────────────────────────────
  describe('GET /support/admin/threads', () => {
    it('returns 403 when user is not a manager', async () => {
      // managers maybeSingle returns null
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

      const res = await app.inject({
        method: 'GET',
        url: '/support/admin/threads',
      })

      expect(res.statusCode).toBe(403)
      const body = JSON.parse(res.body) as { error: { code: string } }
      expect(body.error.code).toBe('FORBIDDEN')
    })

    it('returns thread list for managers', async () => {
      // managers check — returns active manager
      mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'mgr-1' }, error: null })

      const threads = [
        {
          id: 'thread-1',
          user_id: 'user-123',
          status: 'escalated',
          priority: 'P1',
          escalation_summary: 'Need refund',
          assigned_to: null,
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
        },
      ]

      // support_threads .in().order() returns threads
      mockOrder.mockResolvedValueOnce({ data: threads, error: null })
      // support_messages .in().order() returns messages
      mockOrder.mockResolvedValueOnce({ data: [], error: null })

      const res = await app.inject({
        method: 'GET',
        url: '/support/admin/threads',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body) as { data: { threads: unknown[] }; error: null }
      expect(body.error).toBeNull()
      expect(body.data.threads).toHaveLength(1)
    })
  })

  // ── PATCH /support/admin/threads/:id ─────────────────────────────────────
  describe('PATCH /support/admin/threads/:id', () => {
    it('returns 403 when user is not a manager', async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

      const res = await app.inject({
        method: 'PATCH',
        url: '/support/admin/threads/thread-1',
        payload: { status: 'resolved' },
      })

      expect(res.statusCode).toBe(403)
    })

    it('updates thread status when called by a manager', async () => {
      // managers check
      mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'mgr-1' }, error: null })

      const updatedThread = {
        id: 'thread-1',
        user_id: 'user-123',
        status: 'resolved',
        priority: 'P1',
        escalation_summary: 'Need refund',
        assigned_to: null,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T12:00:00Z',
      }
      mockSingle.mockResolvedValueOnce({ data: updatedThread, error: null })

      const res = await app.inject({
        method: 'PATCH',
        url: '/support/admin/threads/thread-1',
        payload: { status: 'resolved' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body) as { data: { thread: { status: string } }; error: null }
      expect(body.data.thread.status).toBe('resolved')
    })

    it('returns 400 for invalid body', async () => {
      // managers check — won't even be reached for bad body, but include it
      mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'mgr-1' }, error: null })

      const res = await app.inject({
        method: 'PATCH',
        url: '/support/admin/threads/thread-1',
        payload: { assignedTo: 'not-a-uuid' },
      })

      expect(res.statusCode).toBe(400)
    })
  })
})
