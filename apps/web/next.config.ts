import type { NextConfig } from 'next';

const adminSlug = process.env.NEXT_PUBLIC_ADMIN_SLUG || 'admin';
const isDev = process.env.NODE_ENV !== 'production';

// Security headers for apps/web. Applies to the landing page AND the
// admin panel (same origin). Admin-specific routes get an additional
// `Cache-Control: no-store` via middleware (see SEC-002).
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), usb=(), bluetooth=(), payment=(), magnetometer=(), gyroscope=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: isDev ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js + turbopack dev needs 'unsafe-eval' + 'unsafe-inline';
      // production enforcement should drop both and move to a nonce.
      `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ''}`.trim(),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  // Remove the X-Powered-By: Next.js fingerprint.
  poweredByHeader: false,

  transpilePackages: ['@tn-figueiredo/admin', '@tn-figueiredo/affiliate-admin', '@tn-figueiredo/affiliate-portal', '@brighttale/shared'],
  async rewrites() {
    return [
      // Map public admin slug → internal /zadmin filesystem routes
      { source: `/${adminSlug}`, destination: '/zadmin' },
      { source: `/${adminSlug}/:path*`, destination: '/zadmin/:path*' },
      // Same for API routes
      { source: `/api/${adminSlug}/:path*`, destination: '/api/zadmin/:path*' },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // Admin routes: Cache-Control: no-store + X-Robots-Tag: noindex.
      // The X-Robots-Tag closes the gap where a crawler that ignores
      // robots.txt still has to obey the header. Combined with the
      // admin layout's Metadata.robots override and the robots.txt
      // disallow, admin content is triple-blocked from indexing.
      {
        source: `/${adminSlug}/:path*`,
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, private' },
          { key: 'Pragma', value: 'no-cache' },
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate',
          },
        ],
      },
      // The internal /zadmin filesystem path is 404'd by middleware, but
      // add the header anyway — defence in depth.
      {
        source: '/zadmin/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate',
          },
        ],
      },
      // API routes serve JSON to machines — still worth marking noindex
      // so an accidental JSON-surface crawl doesn't surface in search.
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive, nosnippet',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
