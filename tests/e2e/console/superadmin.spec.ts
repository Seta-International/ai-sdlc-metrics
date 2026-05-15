import { expect, test } from '@playwright/test'

const nonSuperadminMe = {
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

const superadminMe = {
  user: {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    email: 'super@x.com',
    name: 'Super',
    pictureUrl: null,
  },
  tenant: null,
  isSuperadmin: true,
  apps: [],
  csrfToken: 't',
}

const tenantsPayload = {
  tenants: [
    {
      id: 't1',
      slug: 'acme',
      displayName: 'Acme',
      status: 'active',
      createdAt: '2026-01-01',
    },
    {
      id: 't2',
      slug: 'globex',
      displayName: 'Globex',
      status: 'active',
      createdAt: '2026-02-01',
    },
  ],
}

test.describe('Console superadmin /admin/tenants', () => {
  test('redirects away when not superadmin', async ({ page }) => {
    await page.route('**/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(nonSuperadminMe),
      }),
    )
    await page.goto('/console/admin/tenants')
    // beforeLoad throws redirect({ to: '/' }) → /console/
    await page.waitForURL((url) => !url.pathname.includes('/admin'))
  })

  test('renders tenants list for superadmin', async ({ page }) => {
    await page.route('**/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(superadminMe),
      }),
    )
    await page.route('**/admin/tenants', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(tenantsPayload),
      }),
    )
    await page.goto('/console/admin/tenants')
    await expect(page.getByText('Tenants')).toBeVisible()
    await expect(page.getByText('acme')).toBeVisible()
    await expect(page.getByText('globex')).toBeVisible()
  })
})
