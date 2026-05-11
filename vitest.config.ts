import { defineConfig } from 'vitest/config'

// Single Vitest process drives every package in parallel; faster than spawning N
// processes via Turbo and gives unified coverage.
export default defineConfig({
  test: {
    pool: 'forks',
    isolate: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 80, branches: 70, functions: 80, statements: 80 },
      exclude: ['dist/**', '**/*.test.ts', '**/__recordings__/**', '**/__fixtures__/**'],
    },
    projects: [
      'platform/*',
      'platform/agent/*',
      'modules/channels/*',
      'modules/products/*',
      'apps/*',
      'tests/integration',
      'tests/e2e',
    ],
  },
})
