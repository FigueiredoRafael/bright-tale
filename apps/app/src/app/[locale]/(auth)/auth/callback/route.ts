import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@brighttale/shared/types/database';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=missing_code`);
  }

  // Bind the Supabase server client to THIS response so any cookies it sets
  // during exchangeCodeForSession ride back to the browser as Set-Cookie
  // headers on the redirect. Using cookies() from next/headers here was
  // unreliable under Next.js 16 + Turbopack — the cookieStore mutations did
  // not consistently transfer to a manually-constructed NextResponse.redirect,
  // so the session cookie never reached the browser and the user bounced
  // straight back to /auth/login.
  let response = NextResponse.redirect(`${origin}/`);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/auth/login?error=callback_failed`);
  }

  // Create user_profiles row (same logic as Fastify onPostSignUp hook).
  // Upsert with ignoreDuplicates avoids conflicts if the row already exists.
  await supabase
    .from('user_profiles')
    .upsert(
      { id: data.user.id, email: data.user.email } as never,
      { onConflict: 'id', ignoreDuplicates: true },
    );

  return response;
}
