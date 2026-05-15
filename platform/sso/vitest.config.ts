import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@seta/sso',
    include: ['src/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
