import { expect, test } from '@playwright/test'

test('tenant_admin connects Microsoft 365 and sees active state', async ({ page }) => {
  const tenantAdId = process.env['TEST_MS_TENANT_AD_ID']?.trim() ?? ''
  const clientId = process.env['TEST_MS_CLIENT_ID']?.trim() ?? ''
  const clientSecret = process.env['TEST_MS_CLIENT_SECRET']?.trim() ?? ''
  const missingEnv = [
    !tenantAdId ? 'TEST_MS_TENANT_AD_ID' : null,
    !clientId ? 'TEST_MS_CLIENT_ID' : null,
    !clientSecret ? 'TEST_MS_CLIENT_SECRET' : null,
  ].filter((value): value is string => value !== null)

  test.skip(
    missingEnv.length > 0,
    `Skipping admin-ms-sync-connect: missing required env var(s): ${missingEnv.join(', ')}`,
  )

  await page.goto('/admin/integrations/microsoft')
  const disconnectButton = page.getByRole('button', { name: /Disconnect/i })
  if (await disconnectButton.isVisible()) {
    page.once('dialog', (dialog) => dialog.accept())
    await disconnectButton.click()
    await page.getByRole('menuitem', { name: /Disconnect \(keep data as Future-only\)/i }).click()
    await expect(page.getByRole('button', { name: /Connect Microsoft 365/i })).toBeVisible()
  }

  await page.getByRole('button', { name: /Connect Microsoft 365/i }).click()

  await page.getByLabel('Tenant (directory) ID').fill(tenantAdId)
  await page.getByLabel('Application (client) ID').fill(clientId)
  await page.getByLabel('Client secret').fill(clientSecret)
  await page.getByRole('button', { name: 'Test & Save' }).click()

  await expect(page.getByText(/Connected/i)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: /Disconnect/i })).toBeVisible()
})
