import { expect, test } from '@playwright/test'

test.describe('People org chart', () => {
  test('opens context, verifies toolbar, expands a node, and navigates to profile', async ({
    page,
    request,
  }) => {
    const loginResponse = await request.post('http://localhost:4000/trpc/identity.devLogin', {
      data: { email: 'canh.ta@setafuture.onmicrosoft.com' },
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

    // No stale fallback text from old implementation
    await expect(page.getByText(/Unnamed employee/i)).toHaveCount(0)
    await expect(page.getByText(/No title/i)).toHaveCount(0)

    // Toolbar: filter chips, compact toggle, export button
    await expect(page.getByLabel('Team filter')).toBeVisible()
    await expect(page.getByText('Location')).toBeVisible()
    await expect(page.getByRole('button', { name: /compact view/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /export org chart/i })).toBeVisible()

    // Zoom controls (floating pill)
    await expect(page.getByRole('button', { name: /zoom in/i })).toBeVisible()

    // Org cards render from the preloaded tree
    const cardCount = await page.locator('[data-testid="org-card"]').count()
    expect(cardCount).toBeGreaterThan(0)

    // Compact view toggles cards to pills
    await page.getByRole('button', { name: /compact view/i }).click()
    await expect(page.locator('[data-testid="org-card"]')).toHaveCount(0)
    await page.getByRole('button', { name: /compact view/i }).click()
    await expect(page.locator('[data-testid="org-card"]').first()).toBeVisible()

    // Expand a node if possible
    const expandButtons = page.getByRole('button', { name: /expand direct reports/i })
    if ((await expandButtons.count()) > 0) {
      await expandButtons.first().click()
    }

    // Navigate to profile
    const viewProfileButton = page.getByRole('button', { name: /view profile/i }).first()
    await expect(viewProfileButton).toBeVisible()
    await viewProfileButton.click()

    await expect(page).toHaveURL(/\/profile\//)
  })
})
