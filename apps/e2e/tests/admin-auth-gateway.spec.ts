/**
 * E2E tests for the auth gateway login flows.
 *
 * Prerequisites (CI provides these; local dev may skip if services aren't running):
 *   - web-shell running on http://localhost:3000
 *   - web-admin running on http://localhost:3010
 *   - apps/api running on http://localhost:3001
 *   - PostgreSQL with seed data (platform_admin + at least one tenant_admin tenant)
 *
 * Environment variables used by these tests:
 *   PLAYWRIGHT_BASE_URL          — shell base URL (default: http://localhost:3000)
 *   PLAYWRIGHT_ADMIN_BASE_URL    — admin app base URL (default: http://localhost:3010)
 *   TEST_PLATFORM_ADMIN_EMAIL    — email of the seeded platform_admin account
 *   TEST_TENANT_ADMIN_EMAIL      — email of the seeded tenant_admin account
 *   TEST_TENANT_SLUG             — org slug that owns the tenant_admin
 *   TEST_TENANT_ID               — UUID of that tenant
 *   TEST_OTHER_TENANT_ID         — UUID of a different tenant (for cross-tenant check)
 *
 * When these vars are absent the tests skip gracefully so local runs without
 * full infrastructure do not block CI badge.
 */

import { test, expect } from '@playwright/test'

const ADMIN_BASE_URL = process.env['PLAYWRIGHT_ADMIN_BASE_URL'] ?? 'http://localhost:3010'

const SHELL_BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(keys: string[]): string[] {
  return keys.filter((k) => !process.env[k])
}

// ---------------------------------------------------------------------------
// Suite 1 — discovery screen
// ---------------------------------------------------------------------------

test.describe('Login page — discovery screen', () => {
  test('shows email/org input before any IdP button', async ({ page }) => {
    await page.goto(`${SHELL_BASE_URL}/auth/login`)

    // Should land on the discover screen: one text input, a Continue button
    await expect(page.getByLabel(/work email or organisation slug/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /continue/i })).toBeVisible()

    // Must NOT show provider buttons on the initial screen
    await expect(page.getByRole('button', { name: /continue with microsoft/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /continue with google/i })).not.toBeVisible()
  })

  test('shows error for unknown org slug', async ({ page }) => {
    await page.goto(`${SHELL_BASE_URL}/auth/login`)

    await page.getByLabel(/work email or organisation slug/i).fill('no-such-org-xyz')
    await page.getByRole('button', { name: /continue/i }).click()

    await expect(page.getByText(/no organisation found/i)).toBeVisible({ timeout: 8_000 })
  })

  test('advances to providers screen after valid org slug', async ({ page }) => {
    const missing = requireEnv(['TEST_TENANT_SLUG'])
    test.skip(missing.length > 0, `Skipping: missing env var(s): ${missing.join(', ')}`)

    const slug = process.env['TEST_TENANT_SLUG']!

    await page.goto(`${SHELL_BASE_URL}/auth/login`)
    await page.getByLabel(/work email or organisation slug/i).fill(slug)
    await page.getByRole('button', { name: /continue/i }).click()

    // Providers screen must show the tenant name heading
    await expect(page.getByRole('heading', { name: /sign in to future/i })).toBeVisible({
      timeout: 8_000,
    })

    // "Use a different account" back link must be present
    await expect(page.getByRole('button', { name: /use a different account/i })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Suite 2 — platform admin flow
// ---------------------------------------------------------------------------

test.describe('Platform admin flow', () => {
  test('platform admin lands on system dashboard after login', async ({ page }) => {
    const missing = requireEnv(['TEST_PLATFORM_ADMIN_EMAIL'])
    test.skip(
      missing.length > 0,
      `Skipping platform admin flow: missing env var(s): ${missing.join(', ')}`,
    )

    const email = process.env['TEST_PLATFORM_ADMIN_EMAIL']!

    // Shell login — magic link or email-only path
    await page.goto(`${SHELL_BASE_URL}/auth/login`)
    await page.getByLabel(/work email or organisation slug/i).fill(email)
    await page.getByRole('button', { name: /continue/i }).click()

    // In dev mode the magic link immediately redirects
    // Wait for the redirect to complete
    await page.waitForURL((url) => url.href.includes('/system/') || url.href.includes('/org/'), {
      timeout: 15_000,
    })

    // Platform admin should reach the system dashboard
    await expect(page).toHaveURL(/\/system\/platform-admins/)
    await expect(page.getByRole('heading', { name: /platform organizations/i })).toBeVisible()
  })

  test('platform admin can open an org overview from the org list', async ({ page }) => {
    const missing = requireEnv(['TEST_PLATFORM_ADMIN_EMAIL', 'TEST_TENANT_ID'])
    test.skip(missing.length > 0, `Skipping: missing env var(s): ${missing.join(', ')}`)

    const tenantId = process.env['TEST_TENANT_ID']!

    // Navigate directly to the org overview (assumes a valid session cookie exists
    // from a previous test or CI fixture setup)
    await page.goto(`${ADMIN_BASE_URL}/org/${tenantId}/overview`)

    await expect(page.getByRole('heading', { name: /organization overview/i })).toBeVisible({
      timeout: 10_000,
    })
  })
})

// ---------------------------------------------------------------------------
// Suite 3 — tenant admin flow
// ---------------------------------------------------------------------------

test.describe('Tenant admin flow', () => {
  test('tenant admin is directed to own org admin after login', async ({ page }) => {
    const missing = requireEnv(['TEST_TENANT_ADMIN_EMAIL', 'TEST_TENANT_ID'])
    test.skip(
      missing.length > 0,
      `Skipping tenant admin flow: missing env var(s): ${missing.join(', ')}`,
    )

    const email = process.env['TEST_TENANT_ADMIN_EMAIL']!
    const tenantId = process.env['TEST_TENANT_ID']!

    await page.goto(`${SHELL_BASE_URL}/auth/login`)
    await page.getByLabel(/work email or organisation slug/i).fill(email)
    await page.getByRole('button', { name: /continue/i }).click()

    // In dev mode magic link auto-logs in
    await page.waitForURL(
      (url) => url.href.includes(`/org/${tenantId}`) || url.href.includes('/auth/login'),
      { timeout: 15_000 },
    )

    // Must land in their own org, not the system dashboard
    await expect(page).toHaveURL(new RegExp(`/org/${tenantId}`))
    await expect(page).not.toHaveURL(/\/system\//)
  })

  test('tenant admin cannot open a different org URL', async ({ page }) => {
    const missing = requireEnv([
      'TEST_TENANT_ADMIN_EMAIL',
      'TEST_TENANT_ID',
      'TEST_OTHER_TENANT_ID',
    ])
    test.skip(
      missing.length > 0,
      `Skipping cross-tenant check: missing env var(s): ${missing.join(', ')}`,
    )

    const otherTenantId = process.env['TEST_OTHER_TENANT_ID']!

    // Attempt to navigate directly to a different tenant's org overview
    await page.goto(`${ADMIN_BASE_URL}/org/${otherTenantId}/overview`)

    // Should be rejected — either redirected to login or shown a forbidden state
    const url = page.url()
    const isForbidden =
      url.includes('/auth/login') ||
      url.includes('/403') ||
      (await page.getByText(/forbidden|not authorized|access denied/i).isVisible())

    expect(isForbidden).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Suite 4 — SSO setup secret safety
// ---------------------------------------------------------------------------

test.describe('SSO setup — secret safety', () => {
  test('SSO setup test result never shows the client secret', async ({ page }) => {
    const missing = requireEnv(['TEST_TENANT_ID'])
    test.skip(
      missing.length > 0,
      `Skipping SSO secret safety check: missing env var(s): ${missing.join(', ')}`,
    )

    const tenantId = process.env['TEST_TENANT_ID']!

    await page.goto(`${ADMIN_BASE_URL}/org/${tenantId}/integrations`)

    // The page must exist and not expose a raw secret in visible text
    await page.waitForLoadState('networkidle')

    // Raw secret patterns: "sk-...", arbitrary long base64-like strings
    // We assert that no client secret (long opaque strings) appears in the DOM body
    const bodyText = await page.locator('body').innerText()

    // A client secret is typically 32-40 char opaque string; detect obvious patterns
    expect(bodyText).not.toMatch(/[A-Za-z0-9_\-]{40,}(?=[^a-z]|$)/)

    // Any "secret" label should show masking (bullet chars) not raw value
    const secretInputs = page.locator('input[type="password"]')
    const count = await secretInputs.count()
    for (let i = 0; i < count; i++) {
      const val = await secretInputs.nth(i).inputValue()
      // Password fields on a read-only/display view must be empty or contain only •
      expect(val.replace(/[•\s]/g, '')).toBe('')
    }
  })
})

// ---------------------------------------------------------------------------
// Suite 5 — OpenAI key rotate flow
// ---------------------------------------------------------------------------

test.describe('OpenAI key rotate flow', () => {
  test('rotate key stores once and later shows only masked metadata', async ({ page }) => {
    const missing = requireEnv(['TEST_TENANT_ID'])
    test.skip(
      missing.length > 0,
      `Skipping OpenAI rotate flow: missing env var(s): ${missing.join(', ')}`,
    )

    const tenantId = process.env['TEST_TENANT_ID']!
    const testKey = 'sk-test-e2e-rotate-0000'

    await page.goto(`${ADMIN_BASE_URL}/org/${tenantId}/ai-config`)
    await page.waitForLoadState('networkidle')

    // Fill in a new key and rotate
    const keyInput = page.getByLabel(/new api key/i)
    await keyInput.fill(testKey)
    await page.getByRole('button', { name: /rotate key/i }).click()

    // After rotate, the raw key must be cleared from the input
    await expect(keyInput).toHaveValue('', { timeout: 10_000 })

    // The page must NOT show the raw key anywhere in the body
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toContain(testKey)

    // The masked display (dots) should be visible
    const maskedDisplay = page.locator('p:has-text("••••")')
    await expect(maskedDisplay).toBeVisible()
  })
})
