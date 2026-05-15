import { expect, test } from '@playwright/test'

test.describe('Console login', () => {
  test('renders both provider buttons by default', async ({ page }) => {
    await page.goto('/console/login')
    await expect(page.getByRole('button', { name: /sign in with microsoft/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible()
  })

  test('clicking Microsoft triggers POST /sso/login/entra', async ({ page }) => {
    await page.route('**/sso/login/entra', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'http://stub.idp/auth' }),
      }),
    )
    await page.goto('/console/login')
    const loginRequest = page.waitForRequest(
      (req) => req.url().includes('/sso/login/entra') && req.method() === 'POST',
    )
    await page.getByRole('button', { name: /sign in with microsoft/i }).click()
    await loginRequest
  })

  test('clicking Google triggers POST /sso/login/google', async ({ page }) => {
    await page.route('**/sso/login/google', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'http://stub.idp/auth' }),
      }),
    )
    await page.goto('/console/login')
    const loginRequest = page.waitForRequest(
      (req) => req.url().includes('/sso/login/google') && req.method() === 'POST',
    )
    await page.getByRole('button', { name: /sign in with google/i }).click()
    await loginRequest
  })
})
