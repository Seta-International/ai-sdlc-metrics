import { createDb, type Db } from '@future/db'
import { ClsService } from 'nestjs-cls'
import { RequestDbContextService } from '../db/request-db-context.service'

/**
 * runWithTenantContext
 *
 * Canonical helper for pg-boss background workers that must perform DB writes
 * behind RLS WITH CHECK policies.
 *
 * The request-bound DB_TOKEN proxy falls back to the base pool when called
 * outside an HTTP request — at that point `RequestDbContextService.getDb()`
 * returns null and queries run on a pool connection without `app.tenant_id`
 * set.  An INSERT evaluated against a WITH CHECK constraint of the form
 * `tenant_id = current_setting('app.tenant_id', true)::uuid` resolves to
 * `tenant_id = NULL` → check fails → Postgres throws a policy violation.
 *
 * This helper:
 *   1. Opens a dedicated pool client.
 *   2. Sets `app.tenant_id` for the duration of the handler via SET_CONFIG.
 *   3. Installs the client into `RequestDbContextService` so all downstream
 *      Drizzle calls on the request-bound DB proxy use the tenant-aware client.
 *   4. RESTOREs the setting and releases the client in a `finally` block.
 *
 * Usage:
 * ```ts
 * await runWithTenantContext({ tenantId, baseDb, requestDbContext, cls }, () =>
 *   worker.handle(job.data),
 * )
 * ```
 */
export async function runWithTenantContext<T>(
  opts: {
    tenantId: string
    baseDb: Db
    requestDbContext: RequestDbContextService
    cls: ClsService
  },
  handler: () => Promise<T>,
): Promise<T> {
  const { tenantId, baseDb, requestDbContext, cls } = opts
  return cls.run(async () => {
    const client = await baseDb.$client.connect()
    try {
      await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId])
      requestDbContext.setDb(createDb(client))
      try {
        return await handler()
      } finally {
        await client.query('RESET app.tenant_id')
      }
    } finally {
      client.release()
    }
  })
}
