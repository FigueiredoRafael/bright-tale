import { describe, it, expect } from 'vitest'

describe('channel personas route', () => {
  it('exports channelPersonasRoutes function', async () => {
    const mod = await import('../channel-personas.js')
    expect(typeof mod.channelPersonasRoutes).toBe('function')
  })
})
