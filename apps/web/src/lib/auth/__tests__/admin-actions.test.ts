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

  it('signInWithGoogle injects appUrl from env', async () => {
    vi.mocked(lib.signInWithGoogle).mockResolvedValue({ ok: true, url: 'https://x' })
    await actions.signInWithGoogle({})
    expect(lib.signInWithGoogle).toHaveBeenCalledWith({
      appUrl: 'https://brighttale.test',
      redirectTo: '/admin',
    })
  })

  it('signInWithGoogle respects caller-provided redirectTo', async () => {
    vi.mocked(lib.signInWithGoogle).mockResolvedValue({ ok: true, url: 'https://x' })
    await actions.signInWithGoogle({ redirectTo: '/admin/users' })
    expect(lib.signInWithGoogle).toHaveBeenCalledWith({
      appUrl: 'https://brighttale.test',
      redirectTo: '/admin/users',
    })
  })

  it('signInWithGoogle throws if NEXT_PUBLIC_APP_URL missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    await expect(actions.signInWithGoogle({})).rejects.toThrow(/NEXT_PUBLIC_APP_URL/)
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
