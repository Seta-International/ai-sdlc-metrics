/**
 * run-with-tenant-context.integration.spec.ts
 *
 * Exercises the production-down bug (C-1): pg-boss workers that INSERT rows
 * behind FORCE ROW LEVEL SECURITY WITH CHECK (tenant_id = ...) would fail
 * when app.tenant_id was not set on the connection.
 *
 * Test plan:
 *   A) WITHOUT runWithTenantContext: direct insert on a pool connection that
 *      has no app.tenant_id set → Postgres must throw the RLS WITH CHECK error.
 *   B) WITH runWithTenantContext: same insert, wrapped in the helper →
 *      the row is inserted and its tenant_id matches the job tenantId.
 *
 * Uses the same infra as sibling integration specs (createTestDb / migrateForTest
 * / seedTenant helpers from @future/db/test-helpers).
 */

import { AsyncLocalStorage } from 'async_hooks'
import { sql, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { ClsService } from 'nestjs-cls'
import { RequestDbContextService } from '../db/request-db-context.service'
import { runWithTenantContext } from './run-with-tenant-context'
import { agentScheduleRun } from '../../modules/agents/infrastructure/schema/agent-schedule-run.schema'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7fff-8000-000000000099'
const SCHEDULE_ID = '01900000-0000-7fff-8000-000000000100'
const TRACE_ID = '01900000-0000-7fff-8000-000000000101'
const FLOW_ID = '01900000-0000-7fff-8000-000000000102'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runWithTenantContext (C-1 RLS integration)', () => {
  const db = createTestDb()

  beforeAll(async () => {
    await migrateForTest()
    await db.execute(sql`TRUNCATE agents.agent_schedule_run RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_ID, slug: 'rls-ctx-tenant' })
  })

  afterAll(async () => {
    await db.execute(sql`TRUNCATE agents.agent_schedule_run RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
  })

  it('C-1.A — INSERT without tenant context → RLS WITH CHECK violation', async () => {
    // Acquire a raw client from the pool — no app.tenant_id set.
    const client = await db.$client.connect()
    try {
      // RESET any leftover context from previous tests.
      await client.query('RESET app.tenant_id')

      // This insert should fail: FORCE RLS evaluates WITH CHECK as
      // tenant_id = current_setting('app.tenant_id', true)::uuid
      // which is tenant_id = NULL → violates check → throws.
      await expect(
        client.query(
          `INSERT INTO agents.agent_schedule_run
               (schedule_id, tenant_id, trace_id, flow_id, taint_seeded, pinned_versions, fired_by)
             VALUES ($1, $2, $3, $4, false, '{}', 'test')`,
          [SCHEDULE_ID, TENANT_ID, TRACE_ID, FLOW_ID],
        ),
      ).rejects.toThrow()
    } finally {
      client.release()
    }
  }, 15_000)

  it('C-1.B — INSERT wrapped in runWithTenantContext → row persisted with correct tenant_id', async () => {
    // Build the minimal collaborators the helper needs.
    // ClsService requires an AsyncLocalStorage instance injected by the DI
    // container in production; in tests we construct it directly.
    const als = new AsyncLocalStorage<Map<string, unknown>>()
    const clsService = new ClsService(als as never)
    const requestDbContext = new RequestDbContextService(clsService)

    const TRACE_ID_B = '01900000-0000-7fff-8000-000000000103'

    await runWithTenantContext(
      { tenantId: TENANT_ID, baseDb: db, requestDbContext, cls: clsService },
      async () => {
        // Use the tenant-aware DB installed by the helper.
        const tenantDb = requestDbContext.getDb()!
        await tenantDb.insert(agentScheduleRun).values({
          scheduleId: SCHEDULE_ID,
          tenantId: TENANT_ID,
          traceId: TRACE_ID_B,
          flowId: FLOW_ID,
          taintSeeded: false,
          pinnedVersions: {},
          firedBy: 'test',
        })
      },
    )

    // Verify row was persisted with the correct tenant_id.
    // Switch connection-level tenant context so RLS allows the SELECT.
    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_ID}, false)`)
    const rows = await db
      .select()
      .from(agentScheduleRun)
      .where(eq(agentScheduleRun.traceId, TRACE_ID_B))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.tenantId).toBe(TENANT_ID)
  }, 15_000)
})
