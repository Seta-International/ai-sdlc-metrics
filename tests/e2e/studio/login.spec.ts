import { expect, test } from '@playwright/test'

test('login page renders both SSO buttons', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /sign in with microsoft/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible()
})
