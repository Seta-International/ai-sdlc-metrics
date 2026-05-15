import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '../../tests/e2e/studio',
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm --filter @seta/studio dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
