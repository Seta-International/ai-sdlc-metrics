import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createWorkflow,
  defineStep,
  setDurableSql,
  setResumeSql,
  workflowRegistry,
} from '../../src'
import { __resetQueueRegistryForTests } from '../../src/runner/queue'
import { clearWorkflow, getAdminPool, getPool } from './support/db'
import { asTenant, TENANT_A } from './support/tenant'

const runnerSql = getPool()
const sql = getAdminPool()

const stepA = defineStep({
  id: 'a',
  inputSchema: z.object({}),
  outputSchema: z.object({ from: z.literal('a') }),
  async execute(_input, ctx) {
    if (ctx.resumePayload === undefined) ctx.suspend({ resumeLabel: 'wait-a' })
    return { from: 'a' as const }
  },
})

const stepB = defineStep({
  id: 'b',
  inputSchema: z.object({}),
  outputSchema: z.object({ from: z.literal('b') }),
  async execute() {
    return { from: 'b' as const }
  },
})

const wf = createWorkflow({
  id: 'wf.parallel',
  inputSchema: z.object({}),
  outputSchema: z.object({
    a: z.object({ from: z.literal('a') }),
    b: z.object({ from: z.literal('b') }),
  }) as unknown as z.ZodType<{ a: { from: 'a' }; b: { from: 'b' } }>,
})
  .parallel([stepA, stepB])
  .commit()

describe('parallel suspend', () => {
  beforeAll(() => {
    setDurableSql(runnerSql)
    setResumeSql(runnerSql)
  })

  beforeEach(async () => {
    workflowRegistry.__resetForTests()
    __resetQueueRegistryForTests()
    workflowRegistry.register(wf)
    await clearWorkflow(sql, 'wf.parallel')
  })

  afterAll(async () => {
    await sql.end()
  })

  it('a suspends; b completes; snapshot has only a in suspendedPaths', async () => {
    const r = await asTenant(TENANT_A, () => wf.run({}))
    expect(r.status).toBe('suspended')

    const [snap] = await sql<
      Array<{ suspended_paths: Record<string, unknown> }>
    >`SELECT suspended_paths FROM agent_workflows.workflow_snapshots WHERE workflow_id = 'wf.parallel'`
    expect(Object.keys(snap?.suspended_paths ?? {})).toEqual(['a'])

    const stepRows = await sql<
      Array<{ step_id: string; status: string }>
    >`SELECT step_id, status FROM agent_workflows.workflow_steps WHERE workflow_id = 'wf.parallel' ORDER BY step_id`
    const byId = Object.fromEntries(stepRows.map((row) => [row.step_id, row.status]))
    expect(byId.a).toBe('suspended')
    expect(byId.b).toBe('completed')
  })
})
