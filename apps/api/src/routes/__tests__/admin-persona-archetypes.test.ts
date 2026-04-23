import { describe, it, expect, vi } from 'vitest'

vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: (_req: unknown, _rep: unknown, done: () => void) => done(),
}))

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({}),
}))

import { adminPersonaArchetypesRoutes } from '../admin-persona-archetypes.js'

describe('admin persona archetypes route', () => {
  it('exports adminPersonaArchetypesRoutes function', () => {
    expect(typeof adminPersonaArchetypesRoutes).toBe('function')
  })
})
