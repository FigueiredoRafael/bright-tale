// Specific route for affiliate application — takes precedence over [...path]
// catch-all and avoids the webpack bundling issue with createAffiliateApiHandler.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase()
  if (!email) return NextResponse.json({ exists: false })

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('affiliates')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    return NextResponse.json({ exists: !!data })
  } catch {
    return NextResponse.json({ exists: false })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      email, password, name,
      channelUrl, channelPlatform, subscribersCount,
      suggestedCode, notes, taxId, socialLinks,
    } = body

    if (!email || !name || (!channelUrl && (!socialLinks || socialLinks.length === 0))) {
      return NextResponse.json(
        { success: false, error: 'Campos obrigatórios: nome, email e pelo menos uma rede social' },
        { status: 400 },
      )
    }

    const normalizedEmail = email.trim().toLowerCase()
    const admin = createAdminClient()

    // Find existing Supabase user by checking the affiliates table first
    const { data: existingAffiliate } = await admin
      .from('affiliates')
      .select('user_id')
      .eq('email', normalizedEmail)
      .maybeSingle()

    let userId: string | null = existingAffiliate?.user_id ?? null

    if (!userId && password) {
      const { data: newUser, error: createError } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
      })
      if (createError) {
        const msg = createError.message ?? ''
        if (msg.includes('already') || msg.includes('registered')) {
          return NextResponse.json(
            { success: false, error: 'Este email já tem uma conta. Tente novamente sem informar senha.' },
            { status: 409 },
          )
        }
        return NextResponse.json(
          { success: false, error: 'Erro ao criar conta. Tente novamente.' },
          { status: 500 },
        )
      }
      userId = newUser.user.id
    } else if (!userId && !password) {
      return NextResponse.json(
        { success: false, error: 'Email não encontrado. Informe uma senha para criar sua conta.', needsPassword: true },
        { status: 422 },
      )
    }

    // Create affiliate record via Fastify (X-Internal-Key required since /affiliate scope has no public auth)
    const applyRes = await fetch(`${process.env.API_URL}/affiliate/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': process.env.INTERNAL_API_KEY ?? '',
      },
      body: JSON.stringify({
        name: name.trim(),
        email: normalizedEmail,
        ...(channelPlatform ? { channelPlatform } : {}),
        ...(channelUrl ? { channelUrl: channelUrl.trim() } : {}),
        ...(subscribersCount != null ? { subscribersCount: Number(subscribersCount) } : {}),
        ...(suggestedCode ? { suggestedCode: suggestedCode.trim().toUpperCase() } : {}),
        ...(notes?.trim() ? { notes: notes.trim() } : {}),
        ...(taxId ? { taxId: String(taxId).replace(/\D/g, '') } : {}),
        ...(socialLinks?.length ? { socialLinks } : {}),
      }),
    })

    const applyData = await applyRes.json()

    if (!applyRes.ok) {
      const err = applyData?.error
      const msg = typeof err === 'string'
        ? err
        : err?.message ?? 'Erro ao processar candidatura'
      return NextResponse.json({ success: false, error: msg }, { status: applyRes.status })
    }

    // Link user_id to the newly created affiliate record
    if (userId) {
      await admin
        .from('affiliates')
        .update({ user_id: userId })
        .eq('email', normalizedEmail)
        .is('user_id', null)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[affiliate/candidatar] unexpected error', err)
    return NextResponse.json(
      { success: false, error: 'Erro interno. Tente novamente.' },
      { status: 500 },
    )
  }
}
