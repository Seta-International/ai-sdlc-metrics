import { defineConfig } from '@playwright/test'

const apiOrigin = process.env.PUBLIC_BASE_URL ?? 'http://localhost:8080'

export default defineConfig({
  testDir: '../../tests/e2e/console',
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: `${apiOrigin}/console`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev',
    cwd: '../..',
    url: apiOrigin,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
