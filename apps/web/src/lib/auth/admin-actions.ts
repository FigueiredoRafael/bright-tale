'use server'

import {
  signInWithPassword as _signInWithPassword,
  signInWithGoogle as _signInWithGoogle,
  forgotPassword as _forgotPassword,
  resetPassword as _resetPassword,
  signOutAction as _signOut,
} from '@tn-figueiredo/auth-nextjs/actions'

function requireAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL
  if (!url) {
    throw new Error('NEXT_PUBLIC_APP_URL is not configured (see spec §3 env inventory)')
  }
  return url
}

const RESET_PATH = '/admin/reset-password'

export async function signInWithPassword(input: { email: string; password: string }) {
  return _signInWithPassword(input)
}

export async function signInWithGoogle(input: { redirectTo?: string }) {
  return _signInWithGoogle({ appUrl: requireAppUrl(), redirectTo: input.redirectTo ?? '/admin' })
}

export async function forgotPassword(input: { email: string }) {
  return _forgotPassword({ email: input.email, appUrl: requireAppUrl(), resetPath: RESET_PATH })
}

export async function resetPassword(input: { password: string }) {
  return _resetPassword(input)
}

export async function signOut() {
  try {
    return await _signOut()
  } catch {
    return { ok: true as const }
  }
}
