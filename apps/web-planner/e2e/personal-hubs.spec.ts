/**
 * Personal Hubs E2E — Plan 3.5 Task 9
 *
 * Full flow:
 *   1. Sign in → /personal/today/board shows empty state
 *   2. Add a task from My Tasks kebab → it appears in My Day
 *   3. Mark the task complete → My Day reflects completed_at
 *   4. Simulate "next day" by directly inserting a yesterday-dated my_day_entry
 *      (plus a new open task with progress < 100) via a test DB helper
 *   5. Reload My Day today → carry-over banner appears
 *   6. Click "Carry over all" → task appears in today's My Day → banner disappears
 *   7. Seed another yesterday candidate → reload → click "Dismiss" → banner hides
 *   8. Reload → banner stays hidden for today (localStorage persistence)
 *
 * Requires docker-compose stack + test env:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3011
 *   E2E_SESSION_TOKEN=<jwt>
 *   E2E_ACTOR_ID=<uuid>
 *   E2E_TENANT_ID=<uuid>
 *   E2E_DATABASE_URL=postgres://...
 */
import { test, expect } from '@playwright/test'
import { injectSession, requiredEnv, testDb } from './helpers/session'

test.describe('Personal Hubs', () => {
  test('full flow: empty → add → complete → carry-over → dismiss', async ({ page, context }) => {
    await injectSession(context)
    const actorId = requiredEnv('E2E_ACTOR_ID')
    const tenantId = requiredEnv('E2E_TENANT_ID')

    // Clean slate — remove any pre-existing My Day entries for this actor.
    await testDb.deleteMyDayEntriesForActor(tenantId, actorId)

    // -----------------------------------------------------------------------
    // Step 1 — My Day empty
    // -----------------------------------------------------------------------
    await page.goto('/personal/today/board')
    await expect(page.getByText(/nothing scheduled for today/i)).toBeVisible()

    // -----------------------------------------------------------------------
    // Step 2 — Add task from My Tasks → appears in My Day
    // -----------------------------------------------------------------------
    const taskId = await testDb.seedAssignedTask({
      tenantId,
      actorId,
      title: 'E2E task A',
    })

    await page.goto('/personal/tasks/grid')
    const row = page.getByRole('row', { name: /E2E task A/i })
    await row.getByRole('button', { name: /open task menu/i }).click()
    await page.getByRole('menuitem', { name: /focus today/i }).click()

    await page.goto('/personal/today/board')
    await expect(page.getByText('E2E task A')).toBeVisible()

    // -----------------------------------------------------------------------
    // Step 3 — Mark task complete → completed_at renders
    // -----------------------------------------------------------------------
    const card = page.getByTestId(`my-day-card-${taskId}`)
    await card.getByRole('button', { name: /mark complete/i }).click()
    await expect(card.getByText(/completed/i)).toBeVisible()

    // -----------------------------------------------------------------------
    // Step 4 — Simulate yesterday: direct DB insert bypasses tRPC so we can
    //          freely set added_date = yesterday.
    //          NOTE: planner.task.progress has CHECK IN (0, 50, 100) so
    //          carry-over candidates use progress = 50 (in-progress).
    // -----------------------------------------------------------------------
    const yesterdayTaskId = await testDb.seedAssignedTask({
      tenantId,
      actorId,
      title: 'E2E carry-over candidate',
      progress: 50,
    })
    await testDb.insertMyDayEntry({
      tenantId,
      actorId,
      taskId: yesterdayTaskId,
      addedDate: 'yesterday',
      completedAt: null,
    })

    // -----------------------------------------------------------------------
    // Step 5 — Reload My Day → carry-over banner visible
    // -----------------------------------------------------------------------
    await page.goto('/personal/today/board')
    const banner = page.getByRole('alert').filter({ hasText: /tasks in my day/i })
    await expect(banner).toBeVisible()

    // -----------------------------------------------------------------------
    // Step 6 — Carry over all → task appears today, banner disappears
    // -----------------------------------------------------------------------
    await banner.getByRole('button', { name: /carry over all/i }).click()
    await expect(page.getByText('E2E carry-over candidate')).toBeVisible()
    await expect(banner).not.toBeVisible()

    // -----------------------------------------------------------------------
    // Step 7 — Add another yesterday-dated entry → banner returns → dismiss
    // -----------------------------------------------------------------------
    const anotherTaskId = await testDb.seedAssignedTask({
      tenantId,
      actorId,
      title: 'E2E candidate 2',
      progress: 50,
    })
    await testDb.insertMyDayEntry({
      tenantId,
      actorId,
      taskId: anotherTaskId,
      addedDate: 'yesterday',
      completedAt: null,
    })

    await page.goto('/personal/today/board')
    const banner2 = page.getByRole('alert').filter({ hasText: /tasks in my day/i })
    await expect(banner2).toBeVisible()
    await banner2.getByRole('button', { name: /dismiss/i }).click()
    await expect(banner2).not.toBeVisible()

    // -----------------------------------------------------------------------
    // Step 8 — Reload → banner still hidden (localStorage persisted per day)
    // -----------------------------------------------------------------------
    await page.reload()
    await expect(page.getByRole('alert').filter({ hasText: /tasks in my day/i })).not.toBeVisible()

    // Cleanup
    await testDb.deleteMyDayEntriesForActor(tenantId, actorId)
    await page.context().clearCookies()
  })
})
