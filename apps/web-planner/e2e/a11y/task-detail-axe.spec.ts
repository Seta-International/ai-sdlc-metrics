/**
 * Accessibility audit — Task detail panel
 * Plan 05 Task 5 — Step 1 + Step 2 axe-core integration + keyboard audit
 *
 * Requires a running web-planner server and a valid E2E_SESSION_TOKEN.
 * Run with:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3011 \
 *   E2E_SESSION_TOKEN=<jwt> \
 *   playwright test --config apps/web-planner/e2e/playwright.config.ts e2e/a11y/task-detail-axe.spec.ts
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createPlanAndGoToBoard, addBucket, addTaskToFirstColumn } from '../helpers/session'

test.describe('a11y — Task detail panel', () => {
  test('task detail panel has no axe violations (WCAG AA)', async ({ page, context }) => {
    await createPlanAndGoToBoard(page, context, 'A11y Task Detail Axe Plan')
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    await addTaskToFirstColumn(page, 'Axe Task Detail Task')

    // Open the task detail panel
    const taskCard = page
      .locator('[data-testid="task-card"]')
      .filter({ hasText: 'Axe Task Detail Task' })
      .first()
    await taskCard.getByTestId('task-title-link').click()
    await page.waitForSelector('[data-testid="task-detail-panel"]')

    // Wait for the panel to finish loading
    await expect(page.locator('[data-testid="task-detail-loading-skeleton"]')).not.toBeVisible({
      timeout: 10000,
    })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    expect(results.violations).toEqual([])
  })

  test('Esc closes task detail panel', async ({ page, context }) => {
    await createPlanAndGoToBoard(page, context, 'A11y Esc Close Plan')
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    await addTaskToFirstColumn(page, 'Esc Close Task')

    // Open the task detail panel
    const taskTitleLink = page
      .locator('[data-testid="task-card"]')
      .filter({ hasText: 'Esc Close Task' })
      .first()
      .getByTestId('task-title-link')
    await taskTitleLink.click()
    await page.waitForSelector('[data-testid="task-detail-panel"]')

    // Verify the panel is visible
    await expect(page.locator('[data-testid="task-detail-panel"]')).toBeVisible()

    // Press Escape — panel should close (router.back() navigates away from /tasks/[id])
    await page.keyboard.press('Escape')

    // After Esc the panel should no longer be present (intercepting route slot is reset)
    await expect(page.locator('[data-testid="task-detail-panel"]')).not.toBeVisible({
      timeout: 5000,
    })

    // URL should have returned to the board (no task segment)
    await expect(page).not.toHaveURL(/\/tasks\//)
  })

  test('focus returns to triggering card after panel closes via Esc', async ({ page, context }) => {
    await createPlanAndGoToBoard(page, context, 'A11y Focus Return Plan')
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    await addTaskToFirstColumn(page, 'Focus Return Task')

    // Focus the task title link via keyboard so we can verify focus returns
    const taskTitleLink = page
      .locator('[data-testid="task-card"]')
      .filter({ hasText: 'Focus Return Task' })
      .first()
      .getByTestId('task-title-link')

    // Focus via Tab or direct focus()
    await taskTitleLink.focus()
    await page.keyboard.press('Enter')
    await page.waitForSelector('[data-testid="task-detail-panel"]')

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="task-detail-panel"]')).not.toBeVisible({
      timeout: 5000,
    })

    // After the panel closes, focus should return to the task title link
    // (the element that was focused before opening the panel)
    await expect(taskTitleLink).toBeFocused({ timeout: 2000 })
  })
})
