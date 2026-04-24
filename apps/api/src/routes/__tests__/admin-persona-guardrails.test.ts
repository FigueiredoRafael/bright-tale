import { describe, it, expect, vi } from 'vitest'

vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: (_req: unknown, _rep: unknown, done: () => void) => done(),
}))

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({}),
}))

import { adminPersonaGuardrailsRoutes } from '../admin-persona-guardrails.js'

describe('admin persona guardrails route', () => {
  it('exports adminPersonaGuardrailsRoutes function', () => {
    expect(typeof adminPersonaGuardrailsRoutes).toBe('function')
  })
})
