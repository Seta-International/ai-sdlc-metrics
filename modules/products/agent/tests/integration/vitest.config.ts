import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@seta/agent:integration',
    testTimeout: 30_000,
  },
})
