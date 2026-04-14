import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  transpilePackages: ['@brighttale/shared'],
  serverExternalPackages: ['sharp'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/:path*`,
      },
    ];
  },
  // Increase proxy timeout for long AI calls (default is too short)
  httpAgentOptions: {
    keepAlive: true,
  },
  experimental: {
    proxyTimeout: 120_000, // 2 minutes for AI generation calls
  },
};

export default nextConfig;
