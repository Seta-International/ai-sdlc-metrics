import { expect, test } from '@playwright/test'

const adminMe = {
  user: {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    email: 'admin@x.com',
    name: 'Admin User',
    pictureUrl: null,
  },
  tenant: {
    id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    slug: 'acme',
    name: 'Acme',
    isAdmin: true,
  },
  isSuperadmin: false,
  apps: ['studio'],
  csrfToken: 't',
}

const memberMe = {
  user: {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    email: 'm@x.com',
    name: 'M',
    pictureUrl: null,
  },
  tenant: {
    id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    slug: 'acme',
    name: 'Acme',
    isAdmin: false,
  },
  isSuperadmin: false,
  apps: ['studio'],
  csrfToken: 't',
}

const membersPayload = {
  members: [
    {
      userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      email: 'admin@x.com',
      name: 'Admin User',
      pictureUrl: null,
      role: 'admin',
      source: 'seed',
      joinedAt: '2026-01-01',
    },
    {
      userId: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      email: 'bob@x.com',
      name: 'Bob',
      pictureUrl: null,
      role: 'member',
      source: 'directory_sync',
      joinedAt: '2026-02-01',
    },
  ],
}

test.describe('Console members', () => {
  test('redirects to login when unauthenticated', async ({ page }) => {
    await page.route('**/me', (route) => route.fulfill({ status: 401 }))
    await page.goto('/console/members')
    // RequireSession does window.location.href = '/console/login?returnTo=...'
    await page.waitForURL(/\/console\/login/)
  })

  test('renders members table for authenticated admin', async ({ page }) => {
    await page.route('**/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(adminMe),
      }),
    )
    await page.route('**/members', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(membersPayload),
      }),
    )
    await page.goto('/console/members')
    await expect(page.getByText('Members')).toBeVisible()
    await expect(page.getByText('Admin User')).toBeVisible()
    await expect(page.getByText('Bob')).toBeVisible()
  })

  test('non-admin gets redirected away from /members', async ({ page }) => {
    await page.route('**/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(memberMe),
      }),
    )
    await page.goto('/console/members')
    // beforeLoad throws redirect({ to: '/' }) which resolves to /console/
    await page.waitForURL((url) => !url.pathname.includes('/members'))
  })
})
