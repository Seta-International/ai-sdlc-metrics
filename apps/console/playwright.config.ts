import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '../../tests/e2e/console',
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm --filter @seta/console dev',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
