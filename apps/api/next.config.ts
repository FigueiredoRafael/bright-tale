import type { NextConfig } from 'next';

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://app.brighttale.io',
];

const nextConfig: NextConfig = {
  transpilePackages: ['@brighttale/shared'],
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: ALLOWED_ORIGINS.join(', '),
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, X-Internal-Key',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
