import { sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, migrateForTest, setTenantContext } from '@future/db/test-helpers'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

describe('DrizzleWriteDedupRepository', () => {
  const db = createTestDb()

  beforeAll(async () => {
    await migrateForTest()
  })

  it('inserts a row and findByKey returns it', async () => {
    const { DrizzleWriteDedupRepository } = await import('./drizzle-write-dedup.repository')
    const repo = new DrizzleWriteDedupRepository(db)
    await setTenantContext(db, TENANT_ID)

    const key = `key-insert-${Date.now()}`
    await repo.insert({
      idempotencyKey: key,
      tenantId: TENANT_ID,
      turnId: '00000000-0000-0000-0000-000000000002',
      toolName: 'planner.create-task',
      resultJson: { taskId: 'abc' },
      expiresAt: new Date(Date.now() + 86_400_000),
    })

    const row = await repo.findByKey(key)
    expect(row).not.toBeNull()
    expect(row!.toolName).toBe('planner.create-task')
    expect(row!.resultJson).toEqual({ taskId: 'abc' })
  })

  it('returns null for an unknown key', async () => {
    const { DrizzleWriteDedupRepository } = await import('./drizzle-write-dedup.repository')
    const repo = new DrizzleWriteDedupRepository(db)
    await setTenantContext(db, TENANT_ID)
    expect(await repo.findByKey('no-such-key')).toBeNull()
  })

  it('deleteExpired removes rows with expiresAt in the past', async () => {
    const { DrizzleWriteDedupRepository } = await import('./drizzle-write-dedup.repository')
    const repo = new DrizzleWriteDedupRepository(db)
    await setTenantContext(db, TENANT_ID)

    const key = `key-expired-${Date.now()}`
    await repo.insert({
      idempotencyKey: key,
      tenantId: TENANT_ID,
      turnId: '00000000-0000-0000-0000-000000000003',
      toolName: 'planner.update-task',
      resultJson: { ok: true },
      expiresAt: new Date(Date.now() - 1000), // expired 1 s ago
    })

    await repo.deleteExpired()

    // Read without RLS filter to confirm row is gone
    await db.execute(sql`SELECT set_config('app.tenant_id', '', false)`)
    const rows = (await db.execute(
      sql`SELECT 1 FROM agents.agent_write_dedup WHERE idempotency_key = ${key}`,
    )) as unknown as { rows: unknown[] }
    expect(rows.rows).toHaveLength(0)
  })
})
