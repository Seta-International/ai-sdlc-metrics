/**
 * Integration smoke test for `agent_tool_invocation` and `agent_turn_sampling_decision`.
 * Verifies: insert + query round-trip, tenant isolation (RLS via app.tenant_id).
 */

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
import { agentToolInvocations, agentTurnSamplingDecisions } from '../schema/agents.schema'
import { eq } from 'drizzle-orm'

const TENANT_A = '01900000-0000-7fff-8000-000000000081'
const USER_A = '01900000-0000-7fff-8000-000000000b81'

describe('agent_tool_invocation schema (Plan 07)', () => {
  const db = createTestDb()

  beforeAll(async () => {
    await migrateForTest()
    await db.execute(sql`TRUNCATE agents.agent_tool_invocation RESTART IDENTITY CASCADE`)
    await db.execute(sql`TRUNCATE agents.agent_turn_sampling_decision RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'obs-tenant-a' })
  })

  afterAll(async () => {
    await db.execute(sql`TRUNCATE agents.agent_tool_invocation RESTART IDENTITY CASCADE`)
    await db.execute(sql`TRUNCATE agents.agent_turn_sampling_decision RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
  })

  it('inserts and retrieves an agent_tool_invocation row', async () => {
    await setTenantContext(db, TENANT_A)
    const traceId = uuidv7()

    await db.insert(agentToolInvocations).values({
      traceId,
      tenantId: TENANT_A,
      userId: USER_A,
      toolName: 'planner.list_tasks',
      args: { filter: 'active' },
      resultStatus: 'ok',
      phase: 1,
    })

    const rows = await db
      .select()
      .from(agentToolInvocations)
      .where(eq(agentToolInvocations.traceId, traceId))

    expect(rows).toHaveLength(1)
    expect(rows[0].toolName).toBe('planner.list_tasks')
    expect(rows[0].resultStatus).toBe('ok')
    expect(rows[0].phase).toBe(1)
    expect(rows[0].tenantId).toBe(TENANT_A)
  })

  it('stores optional fields as nullable (result_preview, sub_agent_key, iteration)', async () => {
    await setTenantContext(db, TENANT_A)
    const traceId = uuidv7()

    await db.insert(agentToolInvocations).values({
      traceId,
      tenantId: TENANT_A,
      userId: USER_A,
      toolName: 'hiring.list_jobs',
      args: {},
      resultStatus: 'error',
      phase: 2,
      subAgentKey: 'hiring-agent',
      iteration: 3,
    })

    const rows = await db
      .select()
      .from(agentToolInvocations)
      .where(eq(agentToolInvocations.traceId, traceId))

    expect(rows).toHaveLength(1)
    expect(rows[0].subAgentKey).toBe('hiring-agent')
    expect(rows[0].iteration).toBe(3)
    expect(rows[0].resultPreview).toBeNull()
    expect(rows[0].resultHash).toBeNull()
  })

  it('inserts and retrieves an agent_turn_sampling_decision row', async () => {
    await setTenantContext(db, TENANT_A)
    const traceId = uuidv7()

    await db.insert(agentTurnSamplingDecisions).values({
      traceId,
      tenantId: TENANT_A,
      userId: USER_A,
      capture: true,
      rootDecisionReason: 'trigger_matched',
      triggersMatchedAtRoot: ['taintFlippedTrigger'],
      triggersMatchedRetroactively: [],
    })

    const rows = await db
      .select()
      .from(agentTurnSamplingDecisions)
      .where(eq(agentTurnSamplingDecisions.traceId, traceId))

    expect(rows).toHaveLength(1)
    expect(rows[0].capture).toBe(true)
    expect(rows[0].rootDecisionReason).toBe('trigger_matched')
    expect(rows[0].triggersMatchedAtRoot).toEqual(['taintFlippedTrigger'])
    expect(rows[0].triggersMatchedRetroactively).toEqual([])
    expect(rows[0].tenantQuotaExhaustedAt).toBeNull()
  })
})
