import { test, expect } from '@playwright/test'

test('home page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Future/)
})

test('unauthenticated user is redirected to login', async () => {
  // TODO: implement once MSAL is wired
  test.skip()
})
