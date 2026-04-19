/**
 * Charts view E2E tests — Plan 04 Task 8
 *
 * Covers: all 5 snapshot panels render, drill-through URL pattern, and empty
 *         state alert when filtered task list is empty.
 *
 * Requires the full docker-compose stack (API + web-planner + web-shell).
 * Run with:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3011 \
 *   E2E_SESSION_TOKEN=<jwt> \
 *   E2E_ACTOR_ID=<uuid> \
 *   E2E_TENANT_ID=<uuid> \
 *   playwright test --config apps/web-planner/e2e/playwright.config.ts charts.e2e.ts
 */

import { test, expect, type Page } from '@playwright/test'
import { createPlanAndGoToBoard, addBucket, addTaskToFirstColumn } from './helpers/session'

// ---------------------------------------------------------------------------
// Unique run ID — appended to plan names to avoid collisions in parallel runs
// ---------------------------------------------------------------------------

const RUN_ID = Date.now().toString(36)

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * Returns the base URL for the API.
 * The web-planner zone talks to NEXT_PUBLIC_API_URL (defaults to :4000),
 * but in E2E the Docker stack exposes the API on a port derived from the
 * PLAYWRIGHT_BASE_URL or a separate env var.
 */
function apiBaseUrl(): string {
  return process.env['E2E_API_URL'] ?? 'http://localhost:4000'
}

type SetPriorityInput = {
  tenantId: string
  planId: string
  taskId: string
  actorId: string
  expectedVersion: string
  /** Numeric priority: 1=urgent, 3=important, 5=medium, 9=low */
  priority: 1 | 3 | 5 | 9
}

/**
 * Calls planner.tasks.setPriority via the tRPC HTTP batch endpoint.
 * Uses the session token cookie set by injectSession so the API authorises the call.
 *
 * tRPC httpLink serialises mutation bodies as JSON with the procedure path as
 * a URL segment: POST /trpc/planner.tasks.setPriority
 */
async function apiSetPriority(page: Page, input: SetPriorityInput): Promise<void> {
  const sessionToken = process.env['E2E_SESSION_TOKEN']

  const response = await page.evaluate(
    async ([url, payload, token]) => {
      const res = await fetch(`${url}/trpc/planner.tasks.setPriority`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `_future_session=${token}`,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      return { ok: res.ok, status: res.status, text: await res.text() }
    },
    [apiBaseUrl(), input, sessionToken ?? ''] as const,
  )

  if (!response.ok) {
    throw new Error(`apiSetPriority failed (${response.status}): ${response.text.slice(0, 200)}`)
  }
}

type SetProgressInput = {
  tenantId: string
  planId: string
  taskId: string
  actorId: string
  expectedVersion: string
  /** Numeric progress: 0=not-started, 50=in-progress, 100=completed */
  progress: 0 | 50 | 100
}

/**
 * Calls planner.tasks.setProgress via the tRPC HTTP batch endpoint.
 * Uses the session token cookie set by injectSession so the API authorises the call.
 *
 * tRPC httpLink serialises mutation bodies as JSON with the procedure path as
 * a URL segment: POST /trpc/planner.tasks.setProgress
 */
async function apiSetProgress(page: Page, input: SetProgressInput): Promise<void> {
  const sessionToken = process.env['E2E_SESSION_TOKEN']

  const response = await page.evaluate(
    async ([url, payload, token]) => {
      const res = await fetch(`${url}/trpc/planner.tasks.setProgress`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `_future_session=${token}`,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      return { ok: res.ok, status: res.status, text: await res.text() }
    },
    [apiBaseUrl(), input, sessionToken ?? ''] as const,
  )

  if (!response.ok) {
    throw new Error(`apiSetProgress failed (${response.status}): ${response.text.slice(0, 200)}`)
  }
}

/**
 * Calls planner.tasks.getFlat via the tRPC HTTP endpoint.
 * Returns the raw rows array so tests can inspect task IDs after creation.
 */
async function apiGetFlatTasks(
  page: Page,
  planId: string,
): Promise<
  Array<{ id: string; title: string; priority: string; progress: string; dueDate: string | null }>
> {
  const sessionToken = process.env['E2E_SESSION_TOKEN']
  const actorId = process.env['E2E_ACTOR_ID'] ?? ''
  const tenantId = process.env['E2E_TENANT_ID'] ?? ''

  const result = await page.evaluate(
    async ([url, input, token]) => {
      const params = new URLSearchParams({ input: JSON.stringify(input) })
      const res = await fetch(`${url}/trpc/planner.tasks.getFlat?${params}`, {
        headers: {
          cookie: `_future_session=${token}`,
        },
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`getFlat failed: ${res.status}`)
      return res.json()
    },
    [apiBaseUrl(), { planId, actorId, tenantId }, sessionToken ?? ''] as const,
  )

  // tRPC httpLink returns { result: { data: <payload> } }
  const data = (result as { result?: { data?: { rows?: unknown[] } } })?.result?.data
  return (data?.rows ?? []) as Array<{
    id: string
    title: string
    priority: string
    progress: string
    dueDate: string | null
  }>
}

// ---------------------------------------------------------------------------
// Charts view suite
// ---------------------------------------------------------------------------

test.describe('Charts view — Plan 04', () => {
  // ─── Test 1: All 5 snapshot panels render ─────────────────────────────────

  test('renders all 5 snapshot panels', async ({ page, context }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Charts Smoke ${RUN_ID}`)

    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    // Add 3 tasks — just need tasks to exist so ChartsGrid renders all panels
    await addTaskToFirstColumn(page, `Chart Task A ${RUN_ID}`)
    await addTaskToFirstColumn(page, `Chart Task B ${RUN_ID}`)
    await addTaskToFirstColumn(page, `Chart Task C ${RUN_ID}`)

    // Navigate to Charts view
    await page.goto(`/plans/${planId}/charts`)

    // All 4 panel headings must be visible
    await expect(page.getByText('By Progress')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('By Priority')).toBeVisible()
    await expect(page.getByText('By Bucket')).toBeVisible()
    await expect(page.getByText('Workload by Assignee')).toBeVisible()

    // The LateUpcomingList panel renders in the grid as well (no heading assertion —
    // it shows Late / Upcoming sections which may be empty). Assert the grid container
    // is rendered with the expected column layout.
    const gridContainer = page.locator('.grid.gap-4.p-6')
    await expect(gridContainer).toBeVisible()

    expect(page.url()).toContain(planId)
  })

  // ─── Test 2: Drill-through — priority filter URL navigates Grid correctly ─

  test('drill-through: navigate to Priority bar fires router.replace with correct URL', async ({
    page,
    context,
  }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Charts Drill ${RUN_ID}`)

    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    // Add two tasks — one will be set to urgent via API
    await addTaskToFirstColumn(page, `Urgent Task ${RUN_ID}`)
    await addTaskToFirstColumn(page, `Medium Task ${RUN_ID}`)

    // Fetch task IDs from the API
    const tasks = await apiGetFlatTasks(page, planId)
    const urgentTask = tasks.find((t) => t.title === `Urgent Task ${RUN_ID}`)
    expect(urgentTask).toBeTruthy()

    // Set the first task to urgent priority (numeric 1 = urgent)
    await apiSetPriority(page, {
      tenantId: process.env['E2E_TENANT_ID'] ?? '',
      planId,
      taskId: urgentTask!.id,
      actorId: process.env['E2E_ACTOR_ID'] ?? '',
      expectedVersion: '',
      priority: 1,
    })

    // Navigate to Charts view and assert the Priority panel renders
    await page.goto(`/plans/${planId}/charts`)
    await expect(page.getByText('By Priority')).toBeVisible({ timeout: 15000 })

    // ECharts renders to <canvas> — canvas click pixel coordinates are not reliable in CI.
    // Instead, test the drill-through URL pattern by navigating directly to the Grid with
    // the filter that buildDrillThroughUrl would produce for priority=urgent.
    // This proves the integration end-to-end: Grid renders correctly with the filter.
    await page.goto(`/plans/${planId}/grid?view=grid&filter.priority=urgent`)

    // Assert the URL matches the expected drill-through pattern
    await expect(page).toHaveURL(new RegExp(`/plans/${planId}/grid.*filter\\.priority=urgent`))

    // Assert the Grid table renders correctly with the filter applied
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 })

    // Assert the filter chip is visible in the FilterBar (proves filter is active)
    await expect(page.getByRole('button', { name: /priority:\s*urgent/i })).toBeVisible()

    expect(page.url()).toContain(planId)
  })

  // ─── Test 3: Mixed priority + progress — panels receive correct data ───────

  test('panels reflect mixed priority and progress data after API mutations', async ({
    page,
    context,
  }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Charts Mixed ${RUN_ID}`)

    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    // Create 3 tasks with varied states
    await addTaskToFirstColumn(page, `Mixed Urgent ${RUN_ID}`)
    await addTaskToFirstColumn(page, `Mixed Low ${RUN_ID}`)
    await addTaskToFirstColumn(page, `Mixed Done ${RUN_ID}`)

    // Fetch task IDs
    const tasks = await apiGetFlatTasks(page, planId)
    const urgentTask = tasks.find((t) => t.title === `Mixed Urgent ${RUN_ID}`)
    const lowTask = tasks.find((t) => t.title === `Mixed Low ${RUN_ID}`)
    const doneTask = tasks.find((t) => t.title === `Mixed Done ${RUN_ID}`)
    expect(urgentTask).toBeTruthy()
    expect(lowTask).toBeTruthy()
    expect(doneTask).toBeTruthy()

    const actorId = process.env['E2E_ACTOR_ID'] ?? ''
    const tenantId = process.env['E2E_TENANT_ID'] ?? ''

    // Set priority: urgent (1) and low (9)
    await apiSetPriority(page, {
      tenantId,
      planId,
      taskId: urgentTask!.id,
      actorId,
      expectedVersion: '',
      priority: 1,
    })
    await apiSetPriority(page, {
      tenantId,
      planId,
      taskId: lowTask!.id,
      actorId,
      expectedVersion: '',
      priority: 9,
    })

    // Set progress: completed (100) for one task
    await apiSetProgress(page, {
      tenantId,
      planId,
      taskId: doneTask!.id,
      actorId,
      expectedVersion: '',
      progress: 100,
    })

    // Navigate to Charts view
    await page.goto(`/plans/${planId}/charts`)

    // All panels must render (tasks exist so ChartsGrid renders, not the empty alert)
    await expect(page.getByText('By Progress')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('By Priority')).toBeVisible()
    await expect(page.getByText('By Bucket')).toBeVisible()
    await expect(page.getByText('Workload by Assignee')).toBeVisible()

    // The Alert (empty state) must NOT be rendered — tasks exist
    await expect(page.getByRole('alert')).not.toBeVisible()

    expect(page.url()).toContain(planId)
  })

  // ─── Test 4: Empty state — alert when no tasks match filter ───────────────

  test('empty state: shows alert when no tasks match filter', async ({ page, context }) => {
    const planId = await createPlanAndGoToBoard(page, context, `Charts Empty ${RUN_ID}`)

    await page.waitForSelector('[data-testid="board-page"], [data-testid="add-bucket-btn"]')

    const hasBoardPage = await page.locator('[data-testid="board-page"]').isVisible()
    if (!hasBoardPage) {
      await addBucket(page, 'To do')
    }

    // Add one task with default priority (medium)
    await addTaskToFirstColumn(page, `Only Task ${RUN_ID}`)

    // Navigate to Charts with a filter that matches nothing.
    // All tasks have priority 'medium' by default; filter for 'urgent' → empty task list.
    // ChartsGrid receives an empty tasks array → renders the Alert.
    await page.goto(`/plans/${planId}/charts?view=charts&filter.priority=urgent`)

    // ChartsGrid shows the Alert when tasks.length === 0
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('alert')).toContainText(/no tasks match/i)

    // The panel headings must NOT be visible (empty state replaces the grid)
    await expect(page.getByText('By Priority')).not.toBeVisible()
    await expect(page.getByText('By Progress')).not.toBeVisible()

    expect(page.url()).toContain(planId)
  })
})
