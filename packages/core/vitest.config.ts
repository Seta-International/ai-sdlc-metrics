import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
      },
    },
  },
})
