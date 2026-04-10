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
    include: [
      'src/**/*.test.ts',
      'src/**/__tests__/**/*.ts',
    ],
    pool: 'forks',
  },
});
