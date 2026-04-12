import { NextResponse, type NextRequest } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware';

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth check if Supabase env vars are not configured (build time)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    // Still handle API proxy if INTERNAL_API_KEY is set
    if (pathname.startsWith('/api/')) {
      return handleApiProxy(request);
    }
    return NextResponse.next();
  }

  const { supabase, response } = createMiddlewareClient(request);
  const { data: { user } } = await supabase.auth.getUser();

  // API proxy requests — inject headers and forward
  if (pathname.startsWith('/api/')) {
    return handleApiProxy(request, user?.id);
  }

  // Auth pages — redirect to home if already logged in
  if (pathname.startsWith('/auth/')) {
    if (user) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return response();
  }

  // App pages — redirect to login if not authenticated
  if (!user) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response();
}

function handleApiProxy(request: NextRequest, userId?: string): NextResponse {
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) {
    return new NextResponse(
      JSON.stringify({
        data: null,
        error: {
          code: 'MIDDLEWARE_MISCONFIGURED',
          message: 'INTERNAL_API_KEY is not set on apps/app',
        },
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  const headers = buildProxyHeaders(request.headers, internalKey, userId);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
