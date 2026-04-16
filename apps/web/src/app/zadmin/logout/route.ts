import { NextResponse } from 'next/server'
import { signOut } from '@/lib/auth/admin-actions'
import { adminPath } from '@/lib/admin-path'

export async function POST(request: Request) {
  // Logout UX must always appear successful — admin-actions.ts swallows errors
  await signOut()
  const loginUrl = new URL(adminPath('/login'), request.url)
  return NextResponse.redirect(loginUrl, { status: 303 })
}
