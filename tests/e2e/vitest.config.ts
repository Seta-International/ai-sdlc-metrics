import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'e2e',
    testTimeout: 60_000,
    exclude: ['**/node_modules/**', 'console/**', 'studio/**'],
  },
})
