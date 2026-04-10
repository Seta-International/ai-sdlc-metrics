import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
      },
      exclude: ['src/test-setup*', 'src/**/*.spec.ts', 'src/**/*.integration.spec.ts'],
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          exclude: ['src/**/*.integration.spec.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.integration.spec.ts'],
          setupFiles: ['src/test-setup.integration.ts'],
        },
      },
    ],
  },
})
