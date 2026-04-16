import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import createIntlMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n/config';

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
  localeDetection: true,
});

/**
 * Builds the proxy header set sent to apps/api.
 *
 * Security invariants:
 * - Any client-supplied `x-internal-key` is deleted before injection.
 *   Browser requests cannot forge the shared secret.
 * - Any client-supplied `x-user-id` is deleted. The downstream API
 *   trusts `x-user-id` only when `x-internal-key` validates, so this
 *   prevents user impersonation via header spoofing.
 * - A `x-request-id` is generated if absent, for end-to-end tracing.
 */
export function buildProxyHeaders(incoming: Headers, internalKey: string, userId?: string): Headers {
  const headers = new Headers(incoming);
  headers.delete('x-internal-key');
  headers.delete('x-user-id');
  headers.set('x-internal-key', internalKey);
  if (userId) {
    headers.set('x-user-id', userId);
  }
  if (!headers.has('x-request-id')) {
    headers.set('x-request-id', crypto.randomUUID());
  }
  return headers;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const internalKey = process.env.INTERNAL_API_KEY;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Build a response we'll mutate with cookie updates
  let response = NextResponse.next({ request });

  // No Supabase env → skip auth, just do API proxy if possible
  if (!supaUrl || !supaKey) {
    if (pathname.startsWith('/api/')) {
      if (!internalKey) {
        return new NextResponse(
          JSON.stringify({
            data: null,
            error: { code: 'PROXY_MISCONFIGURED', message: 'INTERNAL_API_KEY is not set on apps/app' },
          }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        );
      }
      const headers = buildProxyHeaders(request.headers, internalKey);
      return NextResponse.next({ request: { headers } });
    }
    return response;
  }

  // Create Supabase client that syncs cookies to both request and response
  const supabase = createServerClient(supaUrl, supaKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  // API proxy — inject headers AND preserve refreshed cookies
  if (pathname.startsWith('/api/')) {
    if (!internalKey) {
      return new NextResponse(
        JSON.stringify({
          data: null,
          error: { code: 'PROXY_MISCONFIGURED', message: 'INTERNAL_API_KEY is not set' },
        }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      );
    }

    const headers = buildProxyHeaders(request.headers, internalKey, user?.id);

    // Build response with both header overrides AND cookie refresh preserved
    const apiResponse = NextResponse.next({ request: { headers } });
    // Copy over any cookies Supabase set via setAll()
    response.cookies.getAll().forEach((cookie) => {
      apiResponse.cookies.set(cookie);
    });
    return apiResponse;
  }

  // Auth pages — redirect home if already logged in
  // Check both /auth/* and /{locale}/auth/* paths
  const isAuthPage = pathname.startsWith('/auth/') ||
    locales.some((l) => pathname.startsWith(`/${l}/auth/`));
  if (isAuthPage) {
    if (user) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return intlMiddleware(request);
  }

  // App pages — redirect to login if not authenticated
  if (!user) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Apply i18n locale detection/routing
  return intlMiddleware(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
