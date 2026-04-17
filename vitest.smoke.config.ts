import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['scripts/smoke/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
})
