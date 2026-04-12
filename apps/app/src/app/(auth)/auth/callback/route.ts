import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/auth/login?error=callback_failed`);
  }

  // Create user_profiles row (same logic as Fastify onPostSignUp hook).
  // Upsert with ignoreDuplicates avoids conflicts if the row already exists.
  await supabase
    .from('user_profiles')
    .upsert(
      { id: data.user.id, email: data.user.email },
      { onConflict: 'id', ignoreDuplicates: true },
    );

  return NextResponse.redirect(`${origin}/`);
}
