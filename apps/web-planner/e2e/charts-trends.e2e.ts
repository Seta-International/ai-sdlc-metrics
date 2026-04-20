/**
 * Charts Trends view E2E tests — Plan 05 Task 15
 *
 * Validates the structural contract of the Trends section:
 *   1. Flag-on: the Trends section renders with header + RangePicker.
 *   2. Range switching updates the URL state.
 *   3. Empty-state alert renders when no snapshots have accumulated yet
 *      (which is the expected condition on day 1 after rollout — the nightly
 *      snapshot worker hasn't populated `task_daily_snapshot` for this plan).
 *
 * Populating a full 30-day history of synthetic `task_daily_snapshot` rows
 * requires a test-only fixture endpoint which does not yet exist. Data-driven
 * assertions (Burndown / Throughput render with N data points) are deferred
 * to Task 16 (manual staging verification) once the nightly job has run.
 *
 * Requires the full docker-compose stack with the E2E tenant's
 * `planner_charts_trends_enabled` flag set to `true`.
 *
 * Run with:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3011 \
 *   E2E_SESSION_TOKEN=<jwt> \
 *   E2E_ACTOR_ID=<uuid> \
 *   E2E_TENANT_ID=<uuid> \
 *   playwright test --config apps/web-planner/e2e/playwright.config.ts charts-trends.e2e.ts
 */

import { test, expect } from '@playwright/test'
import { createPlanAndGoToBoard } from './helpers/session'

const RUN_ID = Date.now().toString(36)

test.describe('Charts Trends view — Plan 05', () => {
  test('renders Trends section with RangePicker and empty-state when flag enabled', async ({
    page,
    context,
  }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Trends Smoke ${RUN_ID}`)

    await page.goto(`/plans/${planId}/charts`)

    // Trends section should be visible (flag assumed enabled for E2E tenant).
    await expect(page.getByRole('heading', { name: 'Trends' })).toBeVisible()

    // RangePicker should default to "30 days".
    const range30 = page.getByRole('radio', { name: '30 days' })
    await expect(range30).toHaveAttribute('data-state', 'on')

    // Empty-state alert since no snapshots have been persisted yet.
    await expect(page.getByText(/Trend data begins on/)).toBeVisible()
  })

  test('switching range to 7 days updates the URL', async ({ page, context }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Trends Range ${RUN_ID}`)

    await page.goto(`/plans/${planId}/charts`)
    await expect(page.getByRole('heading', { name: 'Trends' })).toBeVisible()

    await page.getByRole('radio', { name: '7 days' }).click()

    await expect.poll(() => page.url()).toContain('trendRange=7d')
    await expect(page.getByRole('radio', { name: '7 days' })).toHaveAttribute('data-state', 'on')
  })
})
