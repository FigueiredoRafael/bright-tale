import nextConfig from 'eslint-config-next';

export default [
  {
    ignores: [
      'playwright-report/**',
      'test-results/**',
      '.next/**',
      'node_modules/**',
    ],
  },
  ...nextConfig,
  {
    rules: {
      // Pre-existing violations across many files — tracked separately
      'react/no-unescaped-entities': 'off',
      // Pre-existing: setState in effect body — tracked separately
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];
