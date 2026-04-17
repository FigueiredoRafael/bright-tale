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
    // Local Supabase demo credentials — shared defaults, safe to commit.
    // See: https://supabase.com/docs/guides/cli/local-development
    env: {
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
      LOCAL_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      INTERNAL_API_KEY: 'test-key',
    },
  },
});
