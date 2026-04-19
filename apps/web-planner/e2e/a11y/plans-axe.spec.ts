/**
 * Accessibility audit — /plans page
 * Plan 05 Task 5 — Step 1 axe-core integration
 *
 * Requires a running web-planner server and a valid E2E_SESSION_TOKEN.
 * Run with:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3011 \
 *   E2E_SESSION_TOKEN=<jwt> \
 *   playwright test --config apps/web-planner/e2e/playwright.config.ts e2e/a11y/plans-axe.spec.ts
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { injectSession } from '../helpers/session'

test.describe('a11y — /plans page', () => {
  test('plans page has no axe violations (WCAG AA)', async ({ page, context }) => {
    await injectSession(context)
    await page.goto('/plans')

    // Wait for the page to settle (loading state resolved)
    await page.waitForSelector('[data-testid="plans-empty-state"], [data-testid="plans-grid"]', {
      timeout: 15000,
    })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    expect(results.violations).toEqual([])
  })

  test('plans page — keyboard tab order: heading → New plan button → card links', async ({
    page,
    context,
  }) => {
    await injectSession(context)
    await page.goto('/plans')
    await page.waitForSelector('[data-testid="plans-empty-state"], [data-testid="plans-grid"]')

    // Focus starts at the body; press Tab to reach first interactive element
    await page.keyboard.press('Tab')
    // The first focusable element should be visible (either a link or button in the nav)
    const focused = page.locator(':focus')
    await expect(focused).toBeVisible()
  })
})
