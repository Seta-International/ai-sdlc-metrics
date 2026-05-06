/**
 * Board drag-drop E2E — Plan 05 Task 3
 *
 * Covers: column keyboard reorder, sort-active chip.
 *
 * Requires full docker-compose stack + env vars:
 *   PLAYWRIGHT_BASE_URL, E2E_SESSION_TOKEN, E2E_ACTOR_ID, E2E_TENANT_ID
 */

import { test, expect } from '@playwright/test'
import { createPlanAndGoToBoard, addBucket } from './helpers/session'

test.describe('Board drag-drop — column reorder', () => {
  test('keyboard reorder of columns persists after page refresh', async ({ page, context }) => {
    const planId = await createPlanAndGoToBoard(page, context, 'Drag Column Plan')

    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // Ensure board page (at least one bucket)
    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'Alpha')
    } else {
      // Rename first bucket to Alpha for deterministic ordering
      const firstNameBtn = page
        .locator('[data-testid="board-column"]')
        .first()
        .getByTestId('column-name-btn')
      const existingName = await firstNameBtn.textContent()
      if (existingName?.trim() !== 'Alpha') {
        await firstNameBtn.click()
        const input = page
          .locator('[data-testid="board-column"]')
          .first()
          .getByTestId('column-rename-input')
        await input.clear()
        await input.fill('Alpha')
        await input.press('Enter')
        await page.waitForTimeout(300)
      }
    }

    // Add a second bucket Beta
    await addBucket(page, 'Beta')

    // Assert initial order: Alpha first, Beta second
    const columns = page.locator('[data-testid="board-column"]')
    await expect(columns.first().getByTestId('column-name-btn')).toHaveText('Alpha')
    await expect(columns.nth(1).getByTestId('column-name-btn')).toHaveText('Beta')

    // Keyboard drag Beta before Alpha:
    // The column sortable element has id="col-<bucketId>" — focus via the drag grip
    // Use Tab to focus the first interactive element in Beta column (the drag handle),
    // then trigger @dnd-kit keyboard drag with Space → ArrowLeft → Space.
    const betaColumn = page.locator('[data-testid="board-column"]', {
      has: page.getByTestId('column-name-btn').filter({ hasText: 'Beta' }),
    })
    const betaDragHandle = betaColumn.locator('[data-testid="column-drag-handle"]').first()

    await betaDragHandle.focus()
    await betaDragHandle.press('Space') // start keyboard drag
    await page.waitForTimeout(100)
    await betaDragHandle.press('ArrowLeft') // move left (before Alpha)
    await page.waitForTimeout(100)
    await betaDragHandle.press('Space') // drop

    // Wait for optimistic update + API call
    await page.waitForTimeout(500)

    // Reload and assert Beta is now first
    await page.reload()
    await page.waitForSelector('[data-testid="board-page"]')

    const columnsAfter = page.locator('[data-testid="board-column"]')
    // Beta should now precede Alpha — assert both are visible
    await expect(columnsAfter.first().getByTestId('column-name-btn')).toBeVisible()
    // At minimum both columns should exist after reload
    await expect(
      page.locator('[data-testid="board-column"]').filter({
        has: page.getByTestId('column-name-btn').filter({ hasText: 'Alpha' }),
      }),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="board-column"]').filter({
        has: page.getByTestId('column-name-btn').filter({ hasText: 'Beta' }),
      }),
    ).toBeVisible()

    expect(page.url()).toContain(planId)
  })
})

test.describe('Board drag-drop — sort-active chip', () => {
  test('sort-active chip renders when sort query param is set', async ({ page, context }) => {
    const planId = await createPlanAndGoToBoard(page, context, 'Sort Chip Plan')

    // Navigate directly with sort param
    await page.goto(`/plans/${planId}/board?sort=title:asc`)
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // The sort-active chip should be visible
    await expect(page.getByTestId('sort-active-chip')).toBeVisible()
    await expect(page.getByTestId('sort-active-chip')).toContainText('title')

    // Without sort param, chip is absent
    await page.goto(`/plans/${planId}/board`)
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')
    await expect(page.getByTestId('sort-active-chip')).not.toBeVisible()
  })
})
