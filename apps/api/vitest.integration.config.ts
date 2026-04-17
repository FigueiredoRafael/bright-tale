import { defineConfig } from 'vitest/config';
import path from 'path';

// Standalone config — doesn't merge with base (merge would concat the base's
// exclude of '*.integration.test.ts', cancelling our include).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@brighttale/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  test: {
    name: 'integration',
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**'],
    pool: 'forks',
    testTimeout: 15_000,
  },
});
