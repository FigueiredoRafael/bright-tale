import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@brighttale/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.test.ts',
      'src/**/__tests__/**/*.ts',
    ],
    exclude: [
      '**/node_modules/**',
      'src/app/**',
      'src/**/*.integration.test.ts',
    ],
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['src/lib/email/**/*.ts'],
      // templates.ts is excluded from tooling-enforced thresholds because
      // HTML-rendering code is output-heavy; its ≥80% target from the spec
      // is a code-review-level check, not tool-gated.
      exclude: ['src/lib/email/templates.ts', 'src/lib/email/__tests__/**'],
      thresholds: {
        branches: 95,
        functions: 95,
        lines: 90,
        statements: 90,
      },
    },
  },
});
