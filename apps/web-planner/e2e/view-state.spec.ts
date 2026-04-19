/**
 * View state E2E tests — Plan 01 Task 14
 *
 * Covers: filter bar, group-by picker, view switching (Board / Grid tabs),
 *         URL deep-linking, and localStorage restore.
 *
 * Requires the full docker-compose stack (API + web-planner + web-shell).
 * Run with:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3011 \
 *   E2E_SESSION_TOKEN=<jwt> \
 *   E2E_ACTOR_ID=<uuid> \
 *   E2E_TENANT_ID=<uuid> \
 *   playwright test --config apps/web-planner/e2e/playwright.config.ts view-state.spec.ts
 */

import { test, expect } from '@playwright/test'
import { createPlanAndGoToBoard, addBucket, addTaskToFirstColumn } from './helpers/session'

// ---------------------------------------------------------------------------
// Unique run ID — appended to plan names to avoid collisions in parallel runs
// ---------------------------------------------------------------------------

const RUN_ID = Date.now().toString(36)

// localStorage key format used by useViewState
const lsKey = (planId: string) => `planner:view:${planId}`

// ---------------------------------------------------------------------------
// View state suite
// ---------------------------------------------------------------------------

test.describe('View state — filter + group-by + view switch + URL/LS restore', () => {
  // Shared plan + tasks created once per test (each test has its own plan)
  // to avoid state pollution between tests.

  // ─── Test 1: FilterBar renders — Add filter button visible ───────────────

  test('FilterBar renders — Add filter button is visible', async ({ page, context }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Filter Render ${RUN_ID}`)

    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    await addTaskToFirstColumn(page, `Task Alpha ${RUN_ID}`)
    await addTaskToFirstColumn(page, `Task Beta ${RUN_ID}`)

    // Assert: "Add filter" button is visible (FilterBar is rendered)
    await expect(page.getByRole('button', { name: /add filter/i })).toBeVisible()

    expect(page.url()).toContain(planId)
  })

  // ─── Test 2: Priority filter chip — chip appears, URL updates, 0 cards shown ──

  test('Priority filter chip appears in bar and URL; urgent filter hides medium tasks', async ({
    page,
    context,
  }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Filter Chip ${RUN_ID}`)

    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    // Seed 2 tasks (default priority = medium)
    await addTaskToFirstColumn(page, `Task One ${RUN_ID}`)
    await addTaskToFirstColumn(page, `Task Two ${RUN_ID}`)

    // Assert: without any filter both task cards are visible
    await expect(page.locator('[data-testid="task-card"]')).toHaveCount(2)

    // Act: open "Add filter" dropdown and pick Priority
    const addFilterBtn = page.getByRole('button', { name: /add filter/i })
    await expect(addFilterBtn).toBeVisible()
    await addFilterBtn.click()

    const priorityMenuItem = page.getByRole('menuitem', { name: /priority/i })
    await expect(priorityMenuItem).toBeVisible()
    await priorityMenuItem.click()

    // Assert: a "Priority:" filter chip is now visible
    const priorityChip = page.getByRole('button', { name: /priority:/i })
    await expect(priorityChip).toBeVisible()

    // Assert: clear-filter button is visible
    await expect(page.getByRole('button', { name: /clear filter/i })).toBeVisible()

    // Assert: URL contains filter.priority (auto-selected urgent)
    await expect(page).toHaveURL(/filter\.priority=urgent/)

    // Assert: task cards count = 0 (all seeded tasks are medium, filter is urgent)
    await expect(page.locator('[data-testid="task-card"]')).toHaveCount(0)

    // Act: clear the priority filter chip — count should return to 2
    await page.getByRole('button', { name: /clear filter/i }).click()

    // Assert: filter chip is gone and both tasks are visible again (bidirectional proof)
    await expect(page.getByRole('button', { name: /priority:/i })).not.toBeVisible()
    await expect(page.locator('[data-testid="task-card"]')).toHaveCount(2)

    expect(page.url()).toContain(planId)
  })

  // ─── Test 3: Group-by Assignee — URL updates to ?group=assignee ──────────

  test('group-by picker changes to Assignee and URL reflects group=assignee', async ({
    page,
    context,
  }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Group By ${RUN_ID}`)

    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    // Seed a task so a board column is visible
    await addTaskToFirstColumn(page, `Group Task ${RUN_ID}`)

    // Act: open the GroupByPicker via stable testid
    const groupByTrigger = page.getByTestId('group-by-trigger')
    await expect(groupByTrigger).toBeVisible()
    await groupByTrigger.click()

    // Select "Assignee"
    const assigneeOption = page.getByRole('option', { name: /^assignee$/i })
    await expect(assigneeOption).toBeVisible()
    await assigneeOption.click()

    // Assert: URL now contains group=assignee
    await expect(page).toHaveURL(/group=assignee/)

    // Assert: trigger now shows "Assignee"
    await expect(page.getByTestId('group-by-trigger')).toContainText(/assignee/i)

    // Assert: the board still renders columns — the seeded task's bucket column remains
    // visible (board currently groups by bucket; group-by state is used for telemetry
    // and future re-grouping; at minimum one column must be present)
    await expect(page.locator('[data-testid="board-column"]').first()).toBeVisible()

    expect(page.url()).toContain(planId)
  })

  // ─── Test 4: URL deep-link filter — navigate to ?filter.priority=urgent ──

  test('URL deep-link with filter.priority=urgent shows filter chip on load', async ({
    page,
    context,
  }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Deep-Link Filter ${RUN_ID}`)

    // Navigate directly to the board with a priority filter pre-set in the URL
    await page.goto(`/plans/${planId}/board?filter.priority=urgent`)
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // Assert: the filter chip reflecting "Priority: urgent" is present
    await expect(page.getByRole('button', { name: /priority:\s*urgent/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /clear filter/i })).toBeVisible()

    expect(page.url()).toContain(planId)
  })

  // ─── Test 5: URL deep-link group — navigate to ?group=assignee ───────────

  test('URL deep-link with group=assignee pre-selects GroupByPicker to Assignee', async ({
    page,
    context,
  }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Deep-Link Group ${RUN_ID}`)

    // Navigate with group=assignee in the URL
    await page.goto(`/plans/${planId}/board?group=assignee`)
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // Assert: GroupByPicker shows "Assignee" as current value
    await expect(page.getByTestId('group-by-trigger')).toContainText(/assignee/i)

    expect(page.url()).toContain(planId)
  })

  // ─── Test 6: Grid tab → ComingSoon ───────────────────────────────────────

  test('clicking Grid tab navigates to /grid and renders the task grid', async ({
    page,
    context,
  }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Grid Tab ${RUN_ID}`)

    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // Act: click the "Grid" tab in ViewPicker
    const gridTab = page.getByRole('tab', { name: /^grid$/i })
    await expect(gridTab).toBeVisible()
    await gridTab.click()

    // Assert: URL changes to /plans/<id>/grid
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]+\/grid/)

    // Assert: real grid table is rendered
    await expect(page.locator('table')).toBeVisible()

    expect(page.url()).toContain(planId)
  })

  // ─── Test 7: View switch preserves URL params (Board→Grid→Board) ─────────

  test('view switching Board→Grid→Board preserves ?group=assignee in URL', async ({
    page,
    context,
  }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Param Preserve ${RUN_ID}`)

    // Start from board with group=assignee already in URL
    await page.goto(`/plans/${planId}/board?group=assignee`)
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // Act: click Grid tab
    const gridTab = page.getByRole('tab', { name: /^grid$/i })
    await expect(gridTab).toBeVisible()
    await gridTab.click()

    // Assert: URL on grid, group=assignee preserved
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]+\/grid/)
    expect(page.url()).toContain('group=assignee')

    // Act: click Board tab to return
    const boardTab = page.getByRole('tab', { name: /^board$/i })
    await boardTab.click()

    // Assert: URL back on board, group=assignee still present
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]+\/board/)
    expect(page.url()).toContain('group=assignee')

    // Assert: board page is visible again
    await expect(page.locator('[data-testid="board-page"]')).toBeVisible()

    expect(page.url()).toContain(planId)
  })

  // ─── Test 8: Hard reload preserves URL params ─────────────────────────────

  test('hard reload preserves filter and group-by from URL query params', async ({
    page,
    context,
  }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Reload Preserve ${RUN_ID}`)

    // Navigate to board with filter and group-by set via URL
    await page.goto(`/plans/${planId}/board?filter.priority=urgent&group=assignee`)
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // Assert initial state: chip visible
    await expect(page.getByRole('button', { name: /priority:\s*urgent/i })).toBeVisible()

    // Act: hard reload
    await page.reload()
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // Assert: filter chip still visible after reload (URL carries the state)
    await expect(page.getByRole('button', { name: /priority:\s*urgent/i })).toBeVisible()

    // Assert: URL still contains both params
    const urlAfterReload = page.url()
    expect(urlAfterReload).toContain('filter.priority=urgent')
    expect(urlAfterReload).toContain('group=assignee')

    expect(page.url()).toContain(planId)
  })

  // ─── Test 9: localStorage restore ────────────────────────────────────────
  //
  // Flow:
  //   1. Set group=assignee via UI  →  URL gets ?group=assignee
  //   2. Poll until localStorage key is written (hook debounces 200 ms)
  //   3. Clear the filter (if any) — wait for LS write with cleared filter
  //   4. Navigate to bare board URL (no params)
  //   5. Assert URL gets ?group=assignee restored from LS
  //   6. Assert filter.priority is NOT in URL (it was cleared / never set)

  test('localStorage restores group-by but not cleared filter when navigating to bare board URL', async ({
    page,
    context,
  }) => {
    const planId = await createPlanAndGoToBoard(page, context, `LocalStorage Restore ${RUN_ID}`)

    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    // ── Step 1: Set group-by to "Assignee" via the picker
    const groupByTrigger = page.getByTestId('group-by-trigger')
    await expect(groupByTrigger).toBeVisible()
    await groupByTrigger.click()

    const assigneeOption = page.getByRole('option', { name: /^assignee$/i })
    await expect(assigneeOption).toBeVisible()
    await assigneeOption.click()

    // Wait for URL to update
    await expect(page).toHaveURL(/group=assignee/)

    // ── Step 2: Poll until localStorage key is written (replaces waitForTimeout)
    await page.waitForFunction(
      (key) => {
        const raw = localStorage.getItem(key)
        if (!raw) return false
        try {
          const parsed = JSON.parse(raw)
          return parsed?.groupBy === 'assignee'
        } catch {
          return false
        }
      },
      lsKey(planId),
      { timeout: 3000 },
    )

    // ── Step 3: Also add and clear a filter to verify it is NOT restored
    //   (navigate to a URL with urgent filter, then clear it, wait for LS write)
    await page.goto(`/plans/${planId}/board?filter.priority=urgent&group=assignee`)
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    await expect(page.getByRole('button', { name: /priority:\s*urgent/i })).toBeVisible()
    await page.getByRole('button', { name: /clear filter/i }).click()
    await expect(page.getByRole('button', { name: /priority:/i })).not.toBeVisible()

    // Wait for LS to be written with cleared filter state
    await page.waitForFunction(
      (key) => {
        const raw = localStorage.getItem(key)
        if (!raw) return false
        try {
          const parsed = JSON.parse(raw)
          // filter should be empty / not contain priority
          return !parsed?.filter?.priority
        } catch {
          return false
        }
      },
      lsKey(planId),
      { timeout: 3000 },
    )

    // ── Step 4: Navigate to bare board URL (no params)
    await page.goto(`/plans/${planId}/board`)
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // ── Step 5: Assert URL gets ?group=assignee restored from localStorage
    // useViewState calls router.replace on mount when URL is empty but LS has state
    await expect(page).toHaveURL(/group=assignee/, { timeout: 5000 })

    // ── Step 6: Assert filter.priority is NOT in the URL (it was cleared)
    expect(page.url()).not.toContain('filter.priority')

    expect(page.url()).toContain(planId)
  })
})
