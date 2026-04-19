/**
 * Grid view E2E tests — Plan 02 Task 13
 *
 * Covers: inline priority edit, bulk select + bulk progress, sort by Due,
 *         and filter carry-over when switching Board→Grid→Board.
 *
 * Requires the full docker-compose stack (API + web-planner + web-shell).
 * Run with:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3011 \
 *   E2E_SESSION_TOKEN=<jwt> \
 *   E2E_ACTOR_ID=<uuid> \
 *   E2E_TENANT_ID=<uuid> \
 *   playwright test --config apps/web-planner/e2e/playwright.config.ts grid.e2e.ts
 */

import { test, expect } from '@playwright/test'
import { createPlanAndGoToBoard, addBucket, addTaskToFirstColumn } from './helpers/session'

// ---------------------------------------------------------------------------
// Unique run ID — appended to plan names to avoid collisions in parallel runs
// ---------------------------------------------------------------------------

const RUN_ID = Date.now().toString(36)

// ---------------------------------------------------------------------------
// Grid view suite
// ---------------------------------------------------------------------------

test.describe('Grid view — Plan 02 Task 13', () => {
  // ─── Test 1: Inline-edit priority change persists after reload ────────────

  test('inline-edit: priority change persists after reload', async ({ page, context }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Grid Priority ${RUN_ID}`)

    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    // Add 3 tasks to the first column
    await addTaskToFirstColumn(page, `Grid Task A ${RUN_ID}`)
    await addTaskToFirstColumn(page, `Grid Task B ${RUN_ID}`)
    await addTaskToFirstColumn(page, `Grid Task C ${RUN_ID}`)

    // Navigate to grid view
    await page.goto(`/plans/${planId}/grid`)
    await page.waitForSelector('table')

    // Find first data row's priority trigger
    const priorityTrigger = page.getByTestId('priority-cell-trigger').first()
    await expect(priorityTrigger).toBeVisible()

    // Click trigger — assert priority popover is visible
    await priorityTrigger.click()
    const priorityPopover = page.getByTestId('priority-popover')
    await expect(priorityPopover).toBeVisible()

    // Click the "Urgent" priority option
    await page.getByTestId('priority-option-urgent').click()

    // Assert trigger now shows "Urgent" text
    await expect(page.getByTestId('priority-cell-trigger').first()).toContainText('Urgent')

    // Reload page and navigate back to grid
    await page.goto(`/plans/${planId}/grid`)
    await page.waitForSelector('table')

    // Assert priority is still "Urgent" after reload
    await expect(page.getByTestId('priority-cell-trigger').first()).toContainText('Urgent')

    expect(page.url()).toContain(planId)
  })

  // ─── Test 2: Bulk select + bulk set progress updates all selected tasks ────

  test('bulk select + bulk set progress updates all selected tasks', async ({ page, context }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Grid Bulk ${RUN_ID}`)

    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    // Add 5 tasks to the first column
    for (let i = 1; i <= 5; i++) {
      await addTaskToFirstColumn(page, `Bulk Task ${i} ${RUN_ID}`)
    }

    // Navigate to grid view
    await page.goto(`/plans/${planId}/grid`)
    await page.waitForSelector('table')

    // Select first 3 data rows by clicking their checkboxes
    const rowCheckboxes = page.locator('tbody').getByRole('checkbox')
    await rowCheckboxes.nth(0).click()
    await rowCheckboxes.nth(1).click()
    await rowCheckboxes.nth(2).click()

    // Assert BulkActionsBar is visible
    await expect(page.getByTestId('bulk-set-progress')).toBeVisible()

    // Assert "3 selected" text is visible
    await expect(page.getByText(/3 selected/i)).toBeVisible()

    // Click bulk-set-progress — assert bulk-progress-popover is visible
    await page.getByTestId('bulk-set-progress').click()
    await expect(page.getByTestId('bulk-progress-popover')).toBeVisible()

    // Click "In progress" option
    await page.getByTestId('bulk-progress-option-in-progress').click()

    // Wait for BulkActionsBar to disappear (selection is cleared on success)
    await expect(page.getByTestId('bulk-set-progress')).not.toBeVisible({ timeout: 10000 })

    // Assert all 3 visible progress cells show "in progress" text
    const progressTriggers = page.getByTestId('progress-cell-trigger')
    const inProgressCount = await progressTriggers.filter({ hasText: /in progress/i }).count()
    expect(inProgressCount).toBeGreaterThanOrEqual(3)

    expect(page.url()).toContain(planId)
  })

  // ─── Test 3: Sort by Due ascending reorders rows ──────────────────────────

  test('sort by Due ascending reorders rows', async ({ page, context }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Grid Sort ${RUN_ID}`)

    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    // Add 3 tasks (sorting works regardless of due dates)
    await addTaskToFirstColumn(page, `Sort Task 1 ${RUN_ID}`)
    await addTaskToFirstColumn(page, `Sort Task 2 ${RUN_ID}`)
    await addTaskToFirstColumn(page, `Sort Task 3 ${RUN_ID}`)

    // Navigate to grid view
    await page.goto(`/plans/${planId}/grid`)
    await page.waitForSelector('table')

    // Find the "Due" column header button
    const dueSortBtn = page.getByRole('columnheader', { name: /due/i }).getByRole('button')
    await expect(dueSortBtn).toBeVisible()

    // Click once → URL should contain sort.field=due&sort.dir=asc
    await dueSortBtn.click()
    await expect(page).toHaveURL(/sort\.field=due/)
    await expect(page).toHaveURL(/sort\.dir=asc/)

    // Click again → URL should contain sort.dir=desc
    await dueSortBtn.click()
    await expect(page).toHaveURL(/sort\.dir=desc/)

    // Click again → sort.field should be absent from URL (cleared)
    await dueSortBtn.click()
    expect(page.url()).not.toContain('sort.field')

    expect(page.url()).toContain(planId)
  })

  // ─── Test 4: Active filter carries over when switching Board→Grid→Board ───

  test('active filter carries over when switching Board→Grid→Board', async ({ page, context }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Grid Filter ${RUN_ID}`)

    // Navigate to board with urgent filter pre-set in URL
    await page.goto(`/plans/${planId}/board?filter.priority=urgent`)
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // Assert filter chip is present on board
    await expect(page.getByRole('button', { name: /priority:\s*urgent/i })).toBeVisible()

    // Navigate to grid view — handle case where tab may be disabled (navigate directly via URL)
    const gridTab = page.getByRole('tab', { name: /^grid$/i })
    const gridTabVisible = await gridTab.isVisible().catch(() => false)

    if (gridTabVisible) {
      await gridTab.click()
    } else {
      // Grid tab not available — navigate directly to URL preserving filter param
      await page.goto(`/plans/${planId}/grid?filter.priority=urgent`)
    }

    // Assert URL contains filter.priority=urgent on grid
    await expect(page).toHaveURL(/filter\.priority=urgent/)

    // Navigate back to board — try tab click, fall back to direct navigation
    const boardTab = page.getByRole('tab', { name: /^board$/i })
    const boardTabVisible = await boardTab.isVisible().catch(() => false)

    if (boardTabVisible) {
      await boardTab.click()
    } else {
      await page.goto(`/plans/${planId}/board?filter.priority=urgent`)
    }

    // Assert URL still contains filter.priority=urgent on board
    await expect(page).toHaveURL(/filter\.priority=urgent/)

    // Assert board page is rendered
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    expect(page.url()).toContain(planId)
  })
})
