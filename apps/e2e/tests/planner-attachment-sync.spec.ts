import { expect, test } from '@playwright/test'

/**
 * E2E smoke suite for the bidirectional Future ↔ SharePoint attachment sync.
 *
 * All three tests require a live MS-linked environment and will be skipped
 * in CI unless the required env vars are set.
 *
 * Required env vars:
 *   PLAYWRIGHT_BASE_URL          — running Future instance URL
 *   TEST_MS_TENANT_AD_ID         — Azure AD tenant (directory) ID
 *   TEST_PLAN_ID                 — Future plan ID (must be linked to an MS group)
 *   TEST_TASK_ID                 — Future task ID inside that plan
 *   TEST_ADMIN_EMAIL             — email of a tenant_admin user
 *   TEST_ADMIN_PASSWORD          — password for that user
 */

const UPLOAD_TIMEOUT_MS = 15_000
const DOWNLOAD_POLL_TIMEOUT_MS = 3 * 60_000 + 10_000

function missingVars(...names: string[]): string[] {
  return names.filter((n) => !process.env[n]?.trim())
}

test.describe('Planner attachment sync', () => {
  test.beforeEach(async ({ page }) => {
    const missing = missingVars(
      'TEST_PLAN_ID',
      'TEST_TASK_ID',
      'TEST_ADMIN_EMAIL',
      'TEST_ADMIN_PASSWORD',
    )
    test.skip(
      missing.length > 0,
      `Skipping attachment sync E2E: missing env var(s): ${missing.join(', ')}`,
    )

    // Sign in via magic link / password flow (reuses existing auth helper pattern)
    await page.goto('/auth/login')
    await page.getByLabel(/email/i).fill(process.env['TEST_ADMIN_EMAIL']!)
    const passwordField = page.getByLabel(/password/i)
    if (await passwordField.isVisible()) {
      await passwordField.fill(process.env['TEST_ADMIN_PASSWORD']!)
      await page.getByRole('button', { name: /sign in/i }).click()
    }
    await page.waitForURL(/dashboard|planner/, { timeout: 15_000 })
  })

  test('Future → SharePoint: attach a 100 KB PDF and verify SharePoint reference appears', async ({
    page,
  }) => {
    const planId = process.env['TEST_PLAN_ID']!
    const taskId = process.env['TEST_TASK_ID']!

    // Navigate to the task detail panel
    await page.goto(`/planner/plans/${planId}`)
    await page.getByTestId(`task-card-${taskId}`).click()
    await expect(page.getByTestId('task-detail-panel')).toBeVisible()

    // Upload a synthetic 100 KB PDF via the attachments UI
    const pdfBytes = Buffer.alloc(100 * 1024, 0x25)
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /attach file/i }).click(),
    ])
    await fileChooser.setFiles({
      name: 'smoke-test.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBytes,
    })

    // Wait for the attachment badge to show "synced" state within 15 s
    await expect(
      page
        .getByTestId(`attachment-sync-badge`)
        .filter({ hasText: /synced/i })
        .first(),
    ).toBeVisible({ timeout: UPLOAD_TIMEOUT_MS })

    // Verify the SharePoint reference link is rendered in the detail panel
    await expect(page.getByRole('link', { name: /smoke-test\.pdf/i })).toBeVisible()
  })

  test('SharePoint → Future: file attached in MS Planner appears in Future within 3 min', async ({
    page,
  }) => {
    const missing = missingVars('TEST_MS_PLANNER_TASK_REFERENCE_URL')
    test.skip(missing.length > 0, `Skipping SharePoint→Future test: missing ${missing.join(', ')}`)

    const planId = process.env['TEST_PLAN_ID']!
    const taskId = process.env['TEST_TASK_ID']!

    // Navigate to the task and poll until the downloaded attachment appears
    await page.goto(`/planner/plans/${planId}`)
    await page.getByTestId(`task-card-${taskId}`).click()
    await expect(page.getByTestId('task-detail-panel')).toBeVisible()

    // The nightly sync or 3-min poll should have picked up the MS reference.
    // We poll for up to 3 min + buffer.
    await expect(page.getByTestId('attachment-list').getByRole('listitem').first()).toBeVisible({
      timeout: DOWNLOAD_POLL_TIMEOUT_MS,
    })
  })

  test('kill-switch off: new attachments stay local, existing synced ones still accessible', async ({
    page,
  }) => {
    const planId = process.env['TEST_PLAN_ID']!
    const taskId = process.env['TEST_TASK_ID']!

    // Flip the kill-switch off via admin settings
    await page.goto('/admin/settings/planner')
    const toggle = page.getByRole('switch', { name: /attachment sync/i })
    if (await toggle.isChecked()) {
      await toggle.click()
      await expect(toggle).not.toBeChecked({ timeout: 5_000 })
    }

    // Verify admin banner is visible
    await page.goto(`/planner/plans/${planId}`)
    await expect(
      page.getByRole('alert').filter({ hasText: /attachment sync.*disabled/i }),
    ).toBeVisible()

    // Upload a new file — it should remain local (no "synced" badge)
    await page.getByTestId(`task-card-${taskId}`).click()
    await expect(page.getByTestId('task-detail-panel')).toBeVisible()

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /attach file/i }).click(),
    ])
    await fileChooser.setFiles({
      name: 'local-only.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('local content'),
    })

    // New attachment should NOT show a "synced" badge
    await expect(
      page.getByTestId('attachment-sync-badge').filter({ hasText: /synced/i }),
    ).not.toBeVisible({ timeout: 5_000 })

    // Re-enable the kill-switch for subsequent tests
    await page.goto('/admin/settings/planner')
    if (!(await toggle.isChecked())) {
      await toggle.click()
      await expect(toggle).toBeChecked({ timeout: 5_000 })
    }
  })
})
