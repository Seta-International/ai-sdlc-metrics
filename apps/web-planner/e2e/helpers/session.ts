import { expect, type BrowserContext, type Page } from '@playwright/test'

export async function injectSession(context: BrowserContext): Promise<void> {
  const token = process.env['E2E_SESSION_TOKEN']
  if (!token) {
    throw new Error(
      'E2E_SESSION_TOKEN is not set. ' +
        'Run the seed script (apps/api/scripts/seed-e2e-session.ts) in CI, ' +
        'or set it to a valid JWT from a magic-link login for local runs.',
    )
  }
  const baseURL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3011'
  const url = new URL(baseURL)
  await context.addCookies([
    {
      name: '_future_session',
      value: token,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    },
  ])
}

export async function createPlanAndGoToBoard(
  page: Page,
  context: BrowserContext,
  name: string,
): Promise<string> {
  await injectSession(context)
  await page.goto('/plans/new')
  await expect(page.getByRole('heading', { name: 'New plan' })).toBeVisible()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create plan' }).click()
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]+\/board/)
  return page.url().match(/\/plans\/([0-9a-f-]+)\/board/)?.[1]!
}

export async function addBucket(page: Page, bucketName: string): Promise<void> {
  await page.getByTestId('add-bucket-btn').click()
  await page.getByTestId('add-bucket-input').fill(bucketName)
  await page.getByTestId('add-bucket-submit').click()
  await expect(
    page.locator('[data-testid="board-column"]').filter({
      has: page.getByTestId('column-name-btn').filter({ hasText: bucketName }),
    }),
  ).toBeVisible()
}

export async function addTaskToFirstColumn(page: Page, taskTitle: string): Promise<void> {
  const firstColumn = page.locator('[data-testid="board-column"]').first()
  await firstColumn.getByRole('button', { name: 'Add task' }).click()
  await firstColumn.getByTestId('quick-add-task-input').fill(taskTitle)
  await firstColumn.getByTestId('quick-add-task-input').press('Enter')
  await expect(
    page.locator('[data-testid="task-card"]').filter({ hasText: taskTitle }),
  ).toBeVisible()
}
