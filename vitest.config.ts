import { defineConfig } from 'vitest/config'

// Single Vitest process drives every package in parallel; faster than spawning N
// processes via Turbo and gives unified coverage.
export default defineConfig({
  test: {
    pool: 'forks',
    isolate: false,
    // Many integration suites share Postgres state (tenants, sso_*, magic_links,
    // agent_memory.*) and rely on coarse cleanup like TRUNCATE … CASCADE.
    // Forcing serial file execution makes cross-suite mutations deterministic;
    // unit tests pay a small wall-clock cost.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 80, branches: 70, functions: 80, statements: 80 },
      exclude: ['dist/**', '**/*.test.ts', '**/__recordings__/**', '**/__fixtures__/**'],
    },
    projects: [
      'platform/audit',
      'platform/connector-registry',
      'platform/db',
      'platform/directory',
      'platform/identity',
      'platform/identity-client',
      'platform/mailer',
      'platform/middleware',
      'platform/ms-graph',
      'platform/oauth',
      'platform/observability',
      'platform/tenancy',
      'platform/ui',
      'platform/agent/*',
      'modules/channels/*',
      'modules/products/*',
      'apps/*',
      'tests/integration',
      'tests/e2e',
    ],
  },
})
