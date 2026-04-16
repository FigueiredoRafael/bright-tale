import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@tn-figueiredo/auth-nextjs';
import { isAdminUser } from '@/lib/admin-check';
import { adminPath, ADMIN_INTERNAL } from '@/lib/admin-path';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const pathname = request.nextUrl.pathname;

  // Block direct access to internal /zadmin path (must go through rewrite)
  if (pathname.startsWith(ADMIN_INTERNAL)) {
    return new NextResponse(null, { status: 404 });
  }

  const prefix = adminPath();

  // Only run auth logic for admin routes
  if (!pathname.startsWith(prefix)) {
    return response;
  }

  // Public admin paths — no auth required
  const PUBLIC_ADMIN_PATHS = new Set([
    adminPath('/login'),
    adminPath('/forgot-password'),
    adminPath('/reset-password'),
    adminPath('/logout'),
  ]);
  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    return response;
  }

  // Skip middleware if Supabase env vars are not configured (build time)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return response;
  }

  const supabase = createServerClient({
    env: {
      apiBaseUrl: '',
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL(adminPath('/login'), request.url));
  }

  if (!await isAdminUser(supabase, user.id)) {
    return NextResponse.redirect(new URL(adminPath('/login?error=unauthorized'), request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
