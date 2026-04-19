/**
 * Charts view visual regression tests — Plan 04 Task 9
 *
 * Takes Playwright snapshot screenshots of the Charts view at 1440px (desktop)
 * and 768px (tablet) viewports. Baseline images are committed under
 * apps/web-planner/e2e/charts.visual.spec.ts-snapshots/ and CI compares on every PR.
 *
 * No snapshotDir is configured in playwright.config.ts, so Playwright uses its
 * default convention: <test-file>-snapshots/<name>-<browser>-<platform>.png
 * e.g. charts.visual.spec.ts-snapshots/charts-desktop-1440-chromium-linux.png
 *
 * Requires the full docker-compose stack (API + web-planner + web-shell).
 * Run with:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3011 \
 *   E2E_SESSION_TOKEN=<jwt> \
 *   E2E_ACTOR_ID=<uuid> \
 *   E2E_TENANT_ID=<uuid> \
 *   playwright test --config apps/web-planner/e2e/playwright.config.ts charts.visual.spec.ts
 *
 * To generate / update baselines (MUST be run against a live stack first):
 *   playwright test ... charts.visual.spec.ts --update-snapshots
 *
 * NOTE: Baseline PNG files are not committed here because they must be generated
 * by running --update-snapshots against a live stack. The directory placeholder
 * (charts.visual.spec.ts-snapshots/.gitkeep) tracks the expected snapshot location
 * in git so CI knows where to look.
 */

import { test, expect } from '@playwright/test'
import { createPlanAndGoToBoard, addBucket, addTaskToFirstColumn } from './helpers/session'

const RUN_ID = Date.now().toString(36)

test.describe('Charts visual regression', () => {
  test('desktop 1440px — Charts view matches snapshot', async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 })

    const planId = await createPlanAndGoToBoard(page, context, `VR Charts Desktop ${RUN_ID}`)

    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')
    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    // Seed enough tasks for all panels to render with meaningful data
    await addTaskToFirstColumn(page, `VR Task 1 ${RUN_ID}`)
    await addTaskToFirstColumn(page, `VR Task 2 ${RUN_ID}`)
    await addTaskToFirstColumn(page, `VR Task 3 ${RUN_ID}`)

    await page.goto(`/plans/${planId}/charts`)

    // Wait for panels to render
    await expect(page.getByText('By Progress')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('By Priority')).toBeVisible()

    // Wait for ECharts to finish rendering (canvas paint is async)
    await page.waitForTimeout(1000)

    await expect(page).toHaveScreenshot('charts-desktop-1440.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02, // allow 2% pixel difference for ECharts anti-aliasing
      animations: 'disabled',
    })
  })

  test('tablet 768px — Charts view matches snapshot', async ({ page, context }) => {
    await page.setViewportSize({ width: 768, height: 1024 })

    const planId = await createPlanAndGoToBoard(page, context, `VR Charts Tablet ${RUN_ID}`)

    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')
    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    await addTaskToFirstColumn(page, `VR Task 1 ${RUN_ID}`)
    await addTaskToFirstColumn(page, `VR Task 2 ${RUN_ID}`)
    await addTaskToFirstColumn(page, `VR Task 3 ${RUN_ID}`)

    await page.goto(`/plans/${planId}/charts`)

    await expect(page.getByText('By Progress')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('By Priority')).toBeVisible()

    await page.waitForTimeout(1000)

    await expect(page).toHaveScreenshot('charts-tablet-768.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    })
  })
})
