import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { uuidv7 } from 'uuidv7'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { DrizzleStoredSubAgentRepository } from './drizzle-stored-sub-agent.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000081'
const CREATOR = '01900000-0000-7fff-8000-000000000a81'

async function insertStoredSubAgent(
  db: ReturnType<typeof createTestDb>,
  row: {
    id: string
    tenantId: string
    key: string
    version: number
    status: 'draft' | 'active' | 'retired'
    config: Record<string, unknown>
    createdBy: string
  },
): Promise<void> {
  await db.execute(sql`
    INSERT INTO agents.agent_stored_sub_agent
      (id, tenant_id, key, config, version, status, created_by)
    VALUES
      (${row.id}, ${row.tenantId}, ${row.key}, ${JSON.stringify(row.config)}::jsonb,
       ${row.version}, ${row.status}, ${row.createdBy})
  `)
}

describe('DrizzleStoredSubAgentRepository', () => {
  const db = createTestDb()
  let repo: DrizzleStoredSubAgentRepository

  beforeAll(async () => {
    await migrateForTest()
    await db.execute(sql`TRUNCATE agents.agent_stored_sub_agent RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'stored-sub-agent-a' })
    repo = new DrizzleStoredSubAgentRepository(db as never)
  })

  afterAll(async () => {
    await db.execute(sql`TRUNCATE agents.agent_stored_sub_agent RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
  })

  it('findActiveByKey() returns null when the table is empty', async () => {
    await setTenantContext(db, TENANT_A)

    const found = await repo.findActiveByKey({ tenantId: TENANT_A, key: 'no-such-key' })

    expect(found).toBeNull()
  })

  it('findActiveByKey() returns the active row and ignores draft/retired rows', async () => {
    await setTenantContext(db, TENANT_A)
    const key = `sub-agent-${uuidv7().slice(0, 8)}`

    await insertStoredSubAgent(db, {
      id: uuidv7(),
      tenantId: TENANT_A,
      key,
      version: 1,
      status: 'retired',
      config: { stage: 'retired' },
      createdBy: CREATOR,
    })
    await insertStoredSubAgent(db, {
      id: uuidv7(),
      tenantId: TENANT_A,
      key,
      version: 2,
      status: 'draft',
      config: { stage: 'draft' },
      createdBy: CREATOR,
    })
    const activeId = uuidv7()
    await insertStoredSubAgent(db, {
      id: activeId,
      tenantId: TENANT_A,
      key,
      version: 3,
      status: 'active',
      config: { stage: 'active', tools: ['planner.listTasks'] },
      createdBy: CREATOR,
    })

    const found = await repo.findActiveByKey({ tenantId: TENANT_A, key })

    expect(found).not.toBeNull()
    expect(found?.id).toBe(activeId)
    expect(found?.version).toBe(3)
    expect(found?.status).toBe('active')
    expect(found?.config).toEqual({ stage: 'active', tools: ['planner.listTasks'] })
    expect(found?.tenantId).toBe(TENANT_A)
    expect(found?.key).toBe(key)
    expect(found?.createdBy).toBe(CREATOR)
    expect(found?.createdAt).toBeInstanceOf(Date)
  })

  it('findActiveByKey() returns null when only draft/retired rows exist for the key', async () => {
    await setTenantContext(db, TENANT_A)
    const key = `inactive-${uuidv7().slice(0, 8)}`

    await insertStoredSubAgent(db, {
      id: uuidv7(),
      tenantId: TENANT_A,
      key,
      version: 1,
      status: 'draft',
      config: {},
      createdBy: CREATOR,
    })
    await insertStoredSubAgent(db, {
      id: uuidv7(),
      tenantId: TENANT_A,
      key,
      version: 2,
      status: 'retired',
      config: {},
      createdBy: CREATOR,
    })

    const found = await repo.findActiveByKey({ tenantId: TENANT_A, key })

    expect(found).toBeNull()
  })

  it('has RLS enabled + forced and a status CHECK constraint', async () => {
    const rlsRows = (await db.execute(sql`
      SELECT c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'agents' AND c.relname = 'agent_stored_sub_agent'
    `)) as unknown as { rows: Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }> }

    expect(rlsRows.rows).toHaveLength(1)
    expect(rlsRows.rows[0]!.relrowsecurity).toBe(true)
    expect(rlsRows.rows[0]!.relforcerowsecurity).toBe(true)

    // CHECK constraint — inserting an invalid status must fail.
    await setTenantContext(db, TENANT_A)
    await expect(
      db.execute(sql`
        INSERT INTO agents.agent_stored_sub_agent
          (id, tenant_id, key, config, version, status, created_by)
        VALUES
          (${uuidv7()}, ${TENANT_A}, ${'bad-status'}, ${'{}'}::jsonb, 1, 'invalid', ${CREATOR})
      `),
    ).rejects.toThrow(/check constraint/i)
  })
})
