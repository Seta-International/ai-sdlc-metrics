import { expect, type BrowserContext, type Page } from '@playwright/test'
import { Client } from 'pg'

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

// ───── E2E DB helpers ──────────────────────────────────────────────────────

export function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} env var required for E2E`)
  return v
}

async function withTestDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: requiredEnv('E2E_DATABASE_URL') })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/** Compute YYYY-MM-DD for yesterday in the tenant's timezone. Defaults to UTC. */
export function tenantYesterday(tz = 'UTC'): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export const testDb = {
  /**
   * Seeds a task assigned to the given actor in a personal plan they own.
   * Creates the plan + a default bucket if missing. Returns the task id.
   *
   * Note: `planner.task.progress` has a CHECK constraint allowing only 0/50/100
   * and `priority` allows only 1/3/5/9. Caller must pass valid values.
   */
  async seedAssignedTask(input: {
    tenantId: string
    actorId: string
    title: string
    progress?: number
  }): Promise<string> {
    return withTestDb(async (c) => {
      // 1. Ensure a personal plan exists for this actor; pick it or create one.
      const planRes = await c.query<{ id: string }>(
        `SELECT id FROM planner.plan
           WHERE tenant_id = $1 AND owner_actor_id = $2 AND deleted_at IS NULL
           ORDER BY created_at ASC LIMIT 1`,
        [input.tenantId, input.actorId],
      )
      let planId = planRes.rows[0]?.id
      if (!planId) {
        // container_type must be NULL for a personal plan (CHECK chk_plan_container_xor).
        const r = await c.query<{ id: string }>(
          `INSERT INTO planner.plan (id, tenant_id, name, created_by, owner_actor_id, container_type, sync_enabled)
             VALUES (gen_random_uuid(), $1, $2, $3, $3, NULL, false)
           RETURNING id`,
          [input.tenantId, 'E2E Seed Personal', input.actorId],
        )
        planId = r.rows[0]!.id
      }

      // 2. Ensure a default bucket.
      const bucketRes = await c.query<{ id: string }>(
        `SELECT id FROM planner.bucket
           WHERE tenant_id = $1 AND plan_id = $2 AND deleted_at IS NULL
           ORDER BY order_hint ASC LIMIT 1`,
        [input.tenantId, planId],
      )
      let bucketId = bucketRes.rows[0]?.id
      if (!bucketId) {
        const r = await c.query<{ id: string }>(
          `INSERT INTO planner.bucket (id, tenant_id, plan_id, name, order_hint)
             VALUES (gen_random_uuid(), $1, $2, 'To do', '0|a:')
           RETURNING id`,
          [input.tenantId, planId],
        )
        bucketId = r.rows[0]!.id
      }

      // 3. Insert the task. priority=3 (valid per CHECK IN (1,3,5,9)).
      const taskRes = await c.query<{ id: string }>(
        `INSERT INTO planner.task (id, tenant_id, plan_id, bucket_id, title, progress, priority, order_hint, created_by)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 3, '0|a:', $6)
         RETURNING id`,
        [input.tenantId, planId, bucketId, input.title, input.progress ?? 0, input.actorId],
      )
      const taskId = taskRes.rows[0]!.id

      // 4. Self-assign. assigned_by is NOT NULL in the schema.
      await c.query(
        `INSERT INTO planner.task_assignee (tenant_id, task_id, actor_id, assigned_by)
           VALUES ($1, $2, $3, $3)
         ON CONFLICT DO NOTHING`,
        [input.tenantId, taskId, input.actorId],
      )
      return taskId
    })
  },

  /** Inserts a my_day_entry row directly. `addedDate` accepts literal YYYY-MM-DD or the string "yesterday". */
  async insertMyDayEntry(input: {
    tenantId: string
    actorId: string
    taskId: string
    addedDate: string | 'yesterday'
    completedAt: Date | null
    timezone?: string
  }): Promise<void> {
    const date = input.addedDate === 'yesterday' ? tenantYesterday(input.timezone) : input.addedDate
    await withTestDb((c) =>
      c.query(
        `INSERT INTO planner.my_day_entry (actor_id, task_id, added_date, added_at, completed_at, tenant_id)
           VALUES ($1, $2, $3, now(), $4, $5)
         ON CONFLICT (actor_id, task_id, added_date) DO NOTHING`,
        [input.actorId, input.taskId, date, input.completedAt, input.tenantId],
      ),
    )
  },

  /** Removes all my_day_entry rows for an actor/tenant. */
  async deleteMyDayEntriesForActor(tenantId: string, actorId: string): Promise<void> {
    await withTestDb((c) =>
      c.query(`DELETE FROM planner.my_day_entry WHERE tenant_id = $1 AND actor_id = $2`, [
        tenantId,
        actorId,
      ]),
    )
  },
}
