import { test, expect } from '@playwright/test'

const BASE_URL = process.env.WEB_PLANNER_URL ?? 'http://localhost:3011'

test.describe('Agent panel smoke', () => {
  test('panel opens when agent toggle is clicked', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.getByRole('button', { name: /agent/i }).click()
    await expect(page.getByTestId('agent-thread-empty')).toBeVisible()
  })

  test('execution-mode select is visible in composer', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.getByRole('button', { name: /agent/i }).click()
    const select = page.getByRole('combobox')
    await expect(select).toBeVisible()
    await expect(select).toContainText('Default approvals')
  })

  test('execution_mode bypass is sent in turn POST body', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.getByRole('button', { name: /agent/i }).click()

    let capturedBody: Record<string, unknown> = {}
    await page.route('**/api/agent/turn', async (route) => {
      const request = route.request()
      capturedBody = JSON.parse(request.postData() ?? '{}')
      await route.abort()
    })

    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Bypass approvals' }).click()
    await page.getByPlaceholder('Ask the agent...').fill('test')
    await page.getByRole('button', { name: /send/i }).click()

    expect(capturedBody.execution_mode).toBe('bypass')
  })
})
