import type { NextConfig } from 'next';

const adminSlug = process.env.NEXT_PUBLIC_ADMIN_SLUG || 'admin';

const nextConfig: NextConfig = {
  transpilePackages: ['@tn-figueiredo/admin', '@brighttale/shared'],
  async rewrites() {
    return [
      // Map public admin slug → internal /zadmin filesystem routes
      { source: `/${adminSlug}`, destination: '/zadmin' },
      { source: `/${adminSlug}/:path*`, destination: '/zadmin/:path*' },
      // Same for API routes
      { source: `/api/${adminSlug}/:path*`, destination: '/api/zadmin/:path*' },
    ];
  },
};

export default nextConfig;
