import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@tn-figueiredo/auth-nextjs/actions', () => ({
  signInWithPassword: vi.fn(),
  signInWithGoogle: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  signOutAction: vi.fn(),
}))

import * as lib from '@tn-figueiredo/auth-nextjs/actions'
import * as actions from '../admin-actions'

describe('admin-actions wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://brighttale.test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('signInWithPassword forwards input unchanged', async () => {
    vi.mocked(lib.signInWithPassword).mockResolvedValue({ ok: true })
    await actions.signInWithPassword({ email: 'a@b.co', password: 'pw' })
    expect(lib.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw' })
  })

  // SEC-007: Google OAuth is removed from the admin surface. The Server
  // Action is kept as a no-op that returns a disabled-feature error so
  // older clients break loudly instead of silently creating accounts.
  it('signInWithGoogle returns a disabled-feature error without calling the underlying lib', async () => {
    const result = await actions.signInWithGoogle({})
    expect(result).toEqual({
      ok: false,
      error: expect.stringMatching(/Google/i),
    })
    expect(lib.signInWithGoogle).not.toHaveBeenCalled()
  })

  it('signInWithGoogle ignores caller-provided redirectTo (still disabled)', async () => {
    const result = await actions.signInWithGoogle({ redirectTo: '/admin/users' })
    expect(result.ok).toBe(false)
    expect(lib.signInWithGoogle).not.toHaveBeenCalled()
  })

  it('signInWithGoogle stays disabled even when NEXT_PUBLIC_APP_URL is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    const result = await actions.signInWithGoogle({})
    expect(result.ok).toBe(false)
    expect(lib.signInWithGoogle).not.toHaveBeenCalled()
  })

  it('forgotPassword injects appUrl + resetPath', async () => {
    vi.mocked(lib.forgotPassword).mockResolvedValue({ ok: true })
    await actions.forgotPassword({ email: 'a@b.co' })
    expect(lib.forgotPassword).toHaveBeenCalledWith({
      email: 'a@b.co',
      appUrl: 'https://brighttale.test',
      resetPath: '/admin/reset-password',
    })
  })

  it('resetPassword forwards input unchanged', async () => {
    vi.mocked(lib.resetPassword).mockResolvedValue({ ok: true })
    await actions.resetPassword({ password: 'newpass12' })
    expect(lib.resetPassword).toHaveBeenCalledWith({ password: 'newpass12' })
  })

  it('signOut returns lib result when ok', async () => {
    vi.mocked(lib.signOutAction).mockResolvedValue({ ok: true })
    const result = await actions.signOut()
    expect(result).toEqual({ ok: true })
  })

  it('signOut swallows lib errors and returns ok', async () => {
    vi.mocked(lib.signOutAction).mockRejectedValue(new Error('supabase down'))
    const result = await actions.signOut()
    expect(result).toEqual({ ok: true })
  })
})
