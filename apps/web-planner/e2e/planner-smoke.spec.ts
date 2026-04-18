/**
 * Planner smoke test — Plan 01 Task 13
 *
 * Flow: sign in → /plans empty → create plan → board → settings →
 *       add member → rename label → delete plan → back to empty.
 *
 * Requires the full docker-compose stack (API + web-planner + web-shell).
 * Run with:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3011 \
 *   E2E_SESSION_TOKEN=<jwt> \
 *   E2E_ACTOR_ID=<uuid> \
 *   E2E_TENANT_ID=<uuid> \
 *   E2E_MEMBER_ACTOR_ID=<uuid> \
 *   playwright test --config apps/web-planner/e2e/playwright.config.ts
 */

import { test, expect, type BrowserContext } from '@playwright/test'

// ---------------------------------------------------------------------------
// Session injection
// ---------------------------------------------------------------------------

/**
 * Injects a pre-issued JWT as the `_future_session` httpOnly-equivalent cookie
 * so the test actor is recognised as signed-in by every `/api/auth/me` call.
 *
 * In CI the token is minted by the seed script:
 *   apps/api/scripts/seed-e2e-session.ts
 *
 * Locally, set E2E_SESSION_TOKEN to a token from a magic-link login.
 */
async function injectSession(context: BrowserContext): Promise<void> {
  const token = process.env['E2E_SESSION_TOKEN']
  if (!token) {
    throw new Error(
      'E2E_SESSION_TOKEN is not set. ' +
        'Run the seed script or set the env var to a valid session JWT.',
    )
  }

  const baseURL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3011'
  const url = new URL(baseURL)

  await context.addCookies([
    {
      name: '_future_session',
      value: token,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    },
  ])
}

// ---------------------------------------------------------------------------
// Test IDs read from environment so the suite works against any tenant/actor
// ---------------------------------------------------------------------------

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Required env var ${name} is not set`)
  return value
}

// ---------------------------------------------------------------------------
// Smoke flow
// ---------------------------------------------------------------------------

test.describe('Planner smoke', () => {
  test('full plan lifecycle: create → settings → delete', async ({ page, context }) => {
    await injectSession(context)

    const memberActorId = process.env['E2E_MEMBER_ACTOR_ID'] ?? requiredEnv('E2E_ACTOR_ID')

    // -----------------------------------------------------------------------
    // Step 1 — /plans shows empty state
    // -----------------------------------------------------------------------
    await page.goto('/plans')

    await expect(page.getByText('Create your first plan.')).toBeVisible()

    // -----------------------------------------------------------------------
    // Step 2 — Create a plan
    // -----------------------------------------------------------------------
    await page.getByRole('link', { name: 'New plan' }).first().click()

    // The new-plan modal is rendered at /plans/new
    await expect(page).toHaveURL(/\/plans\/new/)
    await expect(page.getByRole('heading', { name: 'New plan' })).toBeVisible()

    await page.getByLabel('Name').fill('E2E Smoke Plan')
    await page.getByRole('button', { name: 'Create plan' }).click()

    // After creation the router pushes to /plans/<id>/board
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]+\/board/)

    // Extract the plan ID from the URL for later navigation
    const boardUrl = page.url()
    const planId = boardUrl.match(/\/plans\/([0-9a-f-]+)\/board/)?.[1]
    expect(planId).toBeTruthy()

    // -----------------------------------------------------------------------
    // Step 3 — Navigate to settings, assert plan name
    // -----------------------------------------------------------------------
    await page.goto(`/plans/${planId}/settings`)

    await expect(page.getByRole('heading', { name: /E2E Smoke Plan.*Settings/ })).toBeVisible()

    // The Details tab is active by default; the name input shows the plan name
    await expect(page.getByLabel('Name')).toHaveValue('E2E Smoke Plan')

    // -----------------------------------------------------------------------
    // Step 4 — Members tab: add a member
    // -----------------------------------------------------------------------
    await page.getByRole('button', { name: 'Members' }).click()

    await page.getByPlaceholder('Actor ID (UUID)').fill(memberActorId)
    await page.getByRole('button', { name: 'Add' }).click()

    // The member row appears in the list
    await expect(page.getByText(memberActorId)).toBeVisible()

    // -----------------------------------------------------------------------
    // Step 5 — Labels tab: rename a label slot
    // -----------------------------------------------------------------------
    await page.getByRole('button', { name: 'Labels' }).click()

    // Click the first label button (shows "Label 1" by default)
    const firstLabel = page.getByRole('button', { name: 'Label 1' }).first()
    await firstLabel.click()

    // An inline text input appears
    const labelInput = page.locator('input[type="text"]').last()
    await labelInput.clear()
    await labelInput.fill('Priority')
    await labelInput.press('Enter')

    // The button now shows the new name
    await expect(page.getByRole('button', { name: 'Priority' })).toBeVisible()

    // -----------------------------------------------------------------------
    // Step 6 — Details tab: delete the plan
    // -----------------------------------------------------------------------
    await page.getByRole('button', { name: 'Details' }).click()

    // Accept the confirm() dialog that the delete handler triggers
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Delete plan' }).click()

    // After deletion the router pushes back to /plans
    await expect(page).toHaveURL(/\/plans$/)

    // -----------------------------------------------------------------------
    // Step 7 — /plans is empty again
    // -----------------------------------------------------------------------
    await expect(page.getByText('Create your first plan.')).toBeVisible()
  })
})
