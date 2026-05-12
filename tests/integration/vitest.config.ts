import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'integration',
    testTimeout: 30_000,
  },
})
