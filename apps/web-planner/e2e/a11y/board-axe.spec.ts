/**
 * Accessibility audit — Board view (with tasks)
 * Plan 05 Task 5 — Step 1 + Step 2 axe-core integration + keyboard audit
 *
 * Requires a running web-planner server and a valid E2E_SESSION_TOKEN.
 * Run with:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3011 \
 *   E2E_SESSION_TOKEN=<jwt> \
 *   playwright test --config apps/web-planner/e2e/playwright.config.ts e2e/a11y/board-axe.spec.ts
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createPlanAndGoToBoard, addBucket, addTaskToFirstColumn } from '../helpers/session'

test.describe('a11y — Board view', () => {
  test('board with tasks has no axe violations (WCAG AA)', async ({ page, context }) => {
    await createPlanAndGoToBoard(page, context, 'A11y Board Axe Plan')

    // Wait for board to render
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    await addTaskToFirstColumn(page, 'Axe Test Task 1')
    await addTaskToFirstColumn(page, 'Axe Test Task 2')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    expect(results.violations).toEqual([])
  })

  test('keyboard tab order: focusable cards in tab sequence', async ({ page, context }) => {
    await createPlanAndGoToBoard(page, context, 'A11y Keyboard Tab Plan')
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    await addTaskToFirstColumn(page, 'Keyboard Tab Task')

    // Tab through the page — the task-title-link inside each task card must be reachable
    // via keyboard. Press Tab multiple times and check if the task-title-link gets focus.
    let taskLinkFocused = false
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab')
      const focusedTestId = await page.evaluate(() => {
        const el = document.activeElement
        return el?.getAttribute('data-testid') ?? ''
      })
      if (focusedTestId === 'task-title-link') {
        taskLinkFocused = true
        break
      }
    }
    expect(taskLinkFocused).toBe(true)
  })

  test('dnd-kit keyboard drag: Space picks up → Arrow moves → Space drops', async ({
    page,
    context,
  }) => {
    await createPlanAndGoToBoard(page, context, 'A11y Keyboard Drag Plan')
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'Column A')
    }

    await addBucket(page, 'Column B')
    await addTaskToFirstColumn(page, 'Keyboard Drag Task')

    const taskCard = page
      .locator('[data-testid="task-card"]')
      .filter({ hasText: 'Keyboard Drag Task' })
      .first()

    // Focus the task card (it is a draggable sortable element from @dnd-kit)
    await taskCard.focus()

    // Space activates keyboard drag mode in @dnd-kit
    await taskCard.press('Space')
    await page.waitForTimeout(150)

    // ArrowRight moves to the next droppable (next column)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(150)

    // Space drops the item in the new position
    await page.keyboard.press('Space')
    await page.waitForTimeout(300)

    // Task should have moved to Column B
    const columnB = page.locator('[data-testid="board-column"]').filter({
      has: page.locator('[data-testid="column-name-btn"]').filter({ hasText: 'Column B' }),
    })
    await expect(
      columnB.locator('[data-testid="task-card"]').filter({ hasText: 'Keyboard Drag Task' }),
    ).toBeVisible({ timeout: 3000 })
  })

  test('aria-live region exists for dnd-kit drag announcements', async ({ page, context }) => {
    await createPlanAndGoToBoard(page, context, 'A11y Aria Live Plan')
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // @dnd-kit/core DndContext renders its own aria-live announcements div.
    // Verify the live region is present in the DOM.
    const liveRegion = page.locator('[aria-live]')
    await expect(liveRegion.first()).toBeAttached()
  })
})
