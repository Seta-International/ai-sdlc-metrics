import { expect, test } from '@playwright/test'

test.describe('People org chart', () => {
  test('opens context, expands a node, and navigates to profile', async ({ page, request }) => {
    const loginResponse = await request.post('http://localhost:4000/trpc/identity.devLogin', {
      data: { email: 'alice@seta.vn' },
    })
    expect(loginResponse.ok()).toBe(true)
    const loginBody = (await loginResponse.json()) as {
      result?: { data?: { token?: string } }
    }
    const token = loginBody.result?.data?.token
    expect(token).toBeTruthy()

    await page.context().addCookies([
      {
        name: '_future_session',
        value: token as string,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
      },
    ])

    await page.goto('/org-chart')

    await expect(page.getByRole('heading', { name: 'Org chart' })).toBeVisible()
    await expect(page.getByText(/starts from your reporting context/i)).toBeVisible()
    await expect(page.getByText(/use people directory/i)).toBeVisible()

    const selfCard = page.getByText(/you/i).first()
    await expect(selfCard).toBeVisible()

    const expandButton = page.getByRole('button', { name: /expand direct reports/i }).first()
    await expandButton.click()

    const viewProfileButton = page.getByRole('button', { name: /view profile/i }).first()
    await expect(viewProfileButton).toBeVisible()
    await viewProfileButton.click()

    await expect(page).toHaveURL(/\/profile\//)
  })
})
