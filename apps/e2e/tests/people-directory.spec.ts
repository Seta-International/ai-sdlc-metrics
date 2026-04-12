import { test, expect } from '@playwright/test'

test.describe('People directory', () => {
  test('table renders on /', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('table')).toBeVisible()
  })

  test('search updates the URL', async ({ page }) => {
    await page.goto('/')
    await page.getByPlaceholder(/search/i).fill('Alice')
    await page.waitForTimeout(400) // debounce
    await expect(page).toHaveURL(/search=Alice/)
  })

  test('sorting changes result order', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /full name/i }).click()
    await expect(page).toHaveURL(/sort=fullName/)
  })

  test('expanding a row shows detail content', async ({ page }) => {
    await page.goto('/')
    await page
      .getByRole('button', { name: /expand/i })
      .first()
      .click()
    await expect(page.getByTestId('expanded-row')).toBeVisible()
  })

  test('export button triggers CSV download', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /export/i }).click(),
    ])
    expect(download.suggestedFilename()).toBe('people-directory.csv')
  })
})
