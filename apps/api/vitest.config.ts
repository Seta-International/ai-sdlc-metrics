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
          setupFiles: ['src/test-setup.unit.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.integration.spec.ts'],
          setupFiles: ['src/test-setup.integration.ts'],
          // Run test files sequentially to prevent TRUNCATE in one file's
          // beforeAll from destroying seed data inserted by another file's beforeAll.
          // Each file's beforeAll → tests → afterAll fully completes before the next starts.
          fileParallelism: false,
          env: {
            TEST_DATABASE_URL:
              process.env['TEST_DATABASE_URL'] ??
              'postgresql://future:future@localhost:5432/future_test',
          },
        },
      },
    ],
  },
})
