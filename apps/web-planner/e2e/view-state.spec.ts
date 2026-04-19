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
// Environment helpers
// ---------------------------------------------------------------------------

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Required env var ${name} is not set. ` +
        'See apps/web-planner/e2e/README.md for setup instructions.',
    )
  }
  return value
}

// ---------------------------------------------------------------------------
// View state suite
// ---------------------------------------------------------------------------

test.describe('View state — filter bar, group-by, view switch, URL deep-link, localStorage', () => {
  // ─── Test 1: Filter bar renders and filter chips appear ──────────────────

  test('filter bar renders and filter chip appears after adding priority filter', async ({
    page,
    context,
  }) => {
    const planId = await createPlanAndGoToBoard(page, context, 'View State Filter Test')

    // Wait for board or empty state
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // Ensure there is at least one bucket
    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    // Add some tasks for meaningful board content
    await addTaskToFirstColumn(page, 'Task Alpha')
    await addTaskToFirstColumn(page, 'Task Beta')

    // ── Assert: "Add filter" button is visible (FilterBar is rendered)
    const addFilterBtn = page.getByRole('button', { name: /add filter/i })
    await expect(addFilterBtn).toBeVisible()

    // ── Act: open "Add filter" dropdown
    await addFilterBtn.click()

    // Priority menu item appears
    const priorityMenuItem = page.getByRole('menuitem', { name: /priority/i })
    await expect(priorityMenuItem).toBeVisible()

    // Click Priority
    await priorityMenuItem.click()

    // ── Assert: a "Priority" filter chip is now visible in the bar
    // FilterChip renders a button whose text starts with "Priority:"
    const priorityChip = page.getByRole('button', { name: /priority:/i })
    await expect(priorityChip).toBeVisible()

    // ── Assert: a "Clear filter" button (X) is adjacent to the chip
    await expect(page.getByRole('button', { name: /clear filter/i })).toBeVisible()

    // ── Assert: the URL now contains filter.priority
    await expect(page).toHaveURL(/filter\.priority=urgent/)

    expect(page.url()).toContain(planId)
  })

  // ─── Test 2: URL deep-link with priority filter restores chip on load ─────

  test('URL deep-link with filter.priority=urgent shows filter chip on load', async ({
    page,
    context,
  }) => {
    const planId = await createPlanAndGoToBoard(page, context, 'View State Deep-Link Test')

    // Navigate directly to the board with a priority filter pre-set in the URL
    await page.goto(`/plans/${planId}/board?filter.priority=urgent`)

    // Wait for board content to render
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // ── Assert: the filter chip reflecting "Priority: urgent" is present
    await expect(page.getByRole('button', { name: /priority:\s*urgent/i })).toBeVisible()

    // ── Assert: "Add filter" is NOT visible (all filter fields used)
    // Actually, "Add filter" only hides when ALL filter fields are active.
    // After deep-linking, the priority chip should be visible. That's sufficient.
    await expect(page.getByRole('button', { name: /clear filter/i })).toBeVisible()

    expect(page.url()).toContain(planId)
  })

  // ─── Test 3: Group-by picker changes the URL parameter ───────────────────

  test('group-by picker updates URL with group param', async ({ page, context }) => {
    const planId = await createPlanAndGoToBoard(page, context, 'View State Group-By Test')

    // Wait for board or empty state
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    // ── Act: click the GroupByPicker select trigger — it shows current value ("Bucket")
    // The SelectTrigger renders a button with the current value text
    const groupByTrigger = page
      .locator('button')
      .filter({ hasText: /bucket/i })
      .last()
    await groupByTrigger.click()

    // The SelectContent appears with all group-by options — click "Priority"
    const priorityOption = page.getByRole('option', { name: /^priority$/i })
    await expect(priorityOption).toBeVisible()
    await priorityOption.click()

    // ── Assert: the URL now contains group=priority
    await expect(page).toHaveURL(/group=priority/)

    // ── Assert: the trigger now shows "Priority"
    await expect(
      page
        .locator('button')
        .filter({ hasText: /^priority$/i })
        .last(),
    ).toBeVisible()

    expect(page.url()).toContain(planId)
  })

  // ─── Test 4: URL deep-link with group=priority pre-selects the picker ────

  test('URL deep-link with group=priority pre-selects GroupByPicker', async ({ page, context }) => {
    const planId = await createPlanAndGoToBoard(page, context, 'View State Group-By Deep-Link Test')

    // Navigate with group=priority in the URL
    await page.goto(`/plans/${planId}/board?group=priority`)

    // Wait for board to render
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // ── Assert: the GroupByPicker shows "Priority" as current value
    // SelectTrigger renders a button with the displayed value
    await expect(
      page
        .locator('button')
        .filter({ hasText: /^priority$/i })
        .last(),
    ).toBeVisible()

    expect(page.url()).toContain(planId)
  })

  // ─── Test 5: View switching — Board → Grid → Grid shows coming soon ───────

  test('clicking Grid tab navigates to grid view and shows coming-soon placeholder', async ({
    page,
    context,
  }) => {
    const planId = await createPlanAndGoToBoard(page, context, 'View State Grid Tab Test')

    // Wait for board or empty state
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // ── Act: click the "Grid" tab in ViewPicker
    // ViewPicker renders <TabsTrigger> elements with labels "Board", "Grid", "Schedule", "Charts"
    const gridTab = page.getByRole('tab', { name: /^grid$/i })
    await expect(gridTab).toBeVisible()
    await gridTab.click()

    // ── Assert: URL changes to /plans/<id>/grid (possibly with query params preserved)
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]+\/grid/)

    // ── Assert: ComingSoon component is rendered
    // ComingSoon renders: "<view> view coming soon" inside AlertTitle
    await expect(page.getByText(/grid view coming soon/i)).toBeVisible()

    expect(page.url()).toContain(planId)
  })

  // ─── Test 6: View switching preserves query params when switching views ───

  test('view switching preserves filter and group-by query params', async ({ page, context }) => {
    const planId = await createPlanAndGoToBoard(page, context, 'View State Param Preserve Test')

    // Wait for board or empty state
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // Start from board with filter + group-by params already in URL
    await page.goto(`/plans/${planId}/board?filter.priority=urgent&group=priority`)
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // ── Act: click Grid tab
    const gridTab = page.getByRole('tab', { name: /^grid$/i })
    await expect(gridTab).toBeVisible()
    await gridTab.click()

    // ── Assert: URL is now on grid and still has filter/group params
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]+\/grid/)
    const currentUrl = page.url()
    expect(currentUrl).toContain('filter.priority=urgent')
    expect(currentUrl).toContain('group=priority')

    // ── Act: click Board tab to return
    const boardTab = page.getByRole('tab', { name: /^board$/i })
    await boardTab.click()

    // ── Assert: URL back on board, params still present
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]+\/board/)
    const boardUrl = page.url()
    expect(boardUrl).toContain('filter.priority=urgent')
    expect(boardUrl).toContain('group=priority')

    // ── Assert: the priority filter chip is still active
    await expect(page.getByRole('button', { name: /priority:\s*urgent/i })).toBeVisible()
  })

  // ─── Test 7: Hard reload preserves filter state from URL ─────────────────

  test('hard reload preserves filter and group-by from URL query params', async ({
    page,
    context,
  }) => {
    const planId = await createPlanAndGoToBoard(page, context, 'View State Reload Test')

    // Navigate to board with filter and group-by set via URL
    await page.goto(`/plans/${planId}/board?filter.priority=urgent&group=priority`)
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // ── Assert initial state
    await expect(page.getByRole('button', { name: /priority:\s*urgent/i })).toBeVisible()

    // ── Act: hard reload
    await page.reload()
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // ── Assert: filter chip is still visible after reload (URL carries the state)
    await expect(page.getByRole('button', { name: /priority:\s*urgent/i })).toBeVisible()

    // ── Assert: URL still contains the params
    const urlAfterReload = page.url()
    expect(urlAfterReload).toContain('filter.priority=urgent')
    expect(urlAfterReload).toContain('group=priority')

    expect(page.url()).toContain(planId)
  })

  // ─── Test 8: localStorage restores group-by when URL has no params ────────

  test('localStorage restores group-by when navigating to board without query params', async ({
    page,
    context,
  }) => {
    const planId = await createPlanAndGoToBoard(page, context, 'View State LocalStorage Test')

    // Wait for board or empty state
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    // ── Step 1: Set group-by to "Priority" via the picker (this writes to localStorage)
    const groupByTrigger = page
      .locator('button')
      .filter({ hasText: /bucket/i })
      .last()
    await groupByTrigger.click()
    const priorityOption = page.getByRole('option', { name: /^priority$/i })
    await expect(priorityOption).toBeVisible()
    await priorityOption.click()

    // Wait for URL to update (the hook replaces with ?group=priority)
    await expect(page).toHaveURL(/group=priority/)

    // Wait for localStorage to be written (hook debounces by 200 ms)
    await page.waitForTimeout(400)

    // ── Step 2: Navigate to the board URL WITHOUT any query params
    // useViewState hydrates from localStorage when URL has no params,
    // then immediately pushes the encoded params back into the URL.
    await page.goto(`/plans/${planId}/board`)

    // Wait for board page to render
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // ── Assert: the group-by is still "Priority" (restored from localStorage → pushed to URL)
    // The hook triggers a router.replace on mount when URL was empty but LS had state.
    await expect(page).toHaveURL(/group=priority/, { timeout: 5000 })

    expect(page.url()).toContain(planId)
  })

  // ─── Test 9: Clearing a filter removes the chip and the URL param ─────────

  test('clearing a filter chip removes the chip and the URL param', async ({ page, context }) => {
    const planId = await createPlanAndGoToBoard(page, context, 'View State Clear Filter Test')

    // Start with a pre-filtered URL
    await page.goto(`/plans/${planId}/board?filter.priority=urgent`)
    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    // ── Assert: filter chip is present
    await expect(page.getByRole('button', { name: /priority:\s*urgent/i })).toBeVisible()

    // ── Act: click the "Clear filter" (X) button
    await page.getByRole('button', { name: /clear filter/i }).click()

    // ── Assert: chip is gone
    await expect(page.getByRole('button', { name: /priority:/i })).not.toBeVisible()

    // ── Assert: URL no longer contains filter.priority
    const urlAfterClear = page.url()
    expect(urlAfterClear).not.toContain('filter.priority')

    // ── Assert: "Add filter" button is back
    await expect(page.getByRole('button', { name: /add filter/i })).toBeVisible()

    expect(page.url()).toContain(planId)
  })
})
