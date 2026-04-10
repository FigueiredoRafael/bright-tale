import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204 });
  }
  const key = req.headers.get('x-internal-key');
  if (!key || key !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid internal key' } },
      { status: 401 }
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
