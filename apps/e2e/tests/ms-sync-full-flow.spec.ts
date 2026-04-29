/**
 * E2E — Full bidirectional MS 365 Planner sync flow.
 *
 * All tests are skipped unless MS_E2E_ENABLED=true.
 *
 * Required env vars (when MS_E2E_ENABLED=true):
 *   MS_E2E_ENABLED              — set to "true" to activate
 *   MS_E2E_TENANT_AD_ID         — Azure AD tenant (directory) ID
 *   MS_E2E_CLIENT_ID            — app registration client ID
 *   MS_E2E_CLIENT_SECRET        — app registration client secret
 *   MS_E2E_LINKED_PLAN_ID       — Future plan ID (already linked to an MS group)
 *   MS_E2E_LINKED_PLAN_MS_ID    — corresponding MS Planner plan ID
 *   TEST_ADMIN_EMAIL             — email of a tenant_admin user
 *   TEST_ADMIN_PASSWORD          — password for that user
 */

import { test, expect } from '../fixtures/ms-planner.fixture'

const MS_E2E_ENABLED = process.env['MS_E2E_ENABLED'] === 'true'

test.describe.configure({ mode: 'serial' })

test.describe('MS 365 bidirectional sync — full flow', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!MS_E2E_ENABLED, 'Set MS_E2E_ENABLED=true to run MS sync E2E tests')

    // Sign in before each step
    await page.goto('/auth/login')
    await page.getByLabel(/email/i).fill(process.env['TEST_ADMIN_EMAIL'] ?? '')
    const passwordField = page.getByLabel(/password/i)
    if (await passwordField.isVisible()) {
      await passwordField.fill(process.env['TEST_ADMIN_PASSWORD'] ?? '')
      await page.getByRole('button', { name: /sign in/i }).click()
    }
    await page.waitForURL(/dashboard|planner/, { timeout: 15_000 })
  })

  test('Step 1: create task in Future → appears in MS within 15 s', async ({ page, msPlanner }) => {
    const linkedPlanId = process.env['MS_E2E_LINKED_PLAN_ID'] ?? ''
    const linkedPlanMsId = process.env['MS_E2E_LINKED_PLAN_MS_ID'] ?? ''

    await page.goto(`/plans/${linkedPlanId}/board`)
    await page.getByRole('button', { name: 'Add task' }).click()
    await page.getByLabel('Title').fill('E2E Sync Task')
    await page.getByRole('button', { name: 'Create' }).click()

    await expect(async () => {
      const msTasks = await msPlanner.listTasks(linkedPlanMsId)
      expect(msTasks.map((t) => t.title)).toContain('E2E Sync Task')
    }).toPass({ timeout: 15_000 })
  })

  test('Step 2: edit task title in MS → appears in Future within 4 min', async ({
    page,
    msPlanner,
  }) => {
    const linkedPlanId = process.env['MS_E2E_LINKED_PLAN_ID'] ?? ''
    const linkedPlanMsId = process.env['MS_E2E_LINKED_PLAN_MS_ID'] ?? ''

    const msTasks = await msPlanner.listTasks(linkedPlanMsId)
    const e2eTask = msTasks.find((t) => t.title === 'E2E Sync Task')
    if (!e2eTask) {
      test.skip()
      return
    }

    await msPlanner.patchTask(e2eTask.id, { title: 'Edited in MS — E2E' })

    await page.goto(`/plans/${linkedPlanId}/board`)
    await expect(page.getByText('Edited in MS — E2E')).toBeVisible({ timeout: 4 * 60_000 })
  })

  test('Step 3: conflict viewer shows open conflicts tab', async ({ page }) => {
    await page.goto('/integrations/microsoft/conflicts')
    await expect(page.getByRole('tab', { name: /Open/i })).toBeVisible()
  })
})
