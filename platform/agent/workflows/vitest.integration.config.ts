import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@seta/agent-workflows:integration',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
  },
})
