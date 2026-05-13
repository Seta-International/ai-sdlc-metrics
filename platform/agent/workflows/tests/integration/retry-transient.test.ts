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

let calls = 0
const flakyStep = defineStep({
  id: 'flaky',
  inputSchema: z.object({}),
  outputSchema: z.object({ ok: z.literal(true) }),
  retry: { maxAttempts: 3 },
  async execute() {
    calls++
    if (calls < 3) {
      const e = new Error(`transient ${calls}`) as Error & { status: number }
      e.status = 503
      throw e
    }
    return { ok: true as const }
  },
})

const wf = createWorkflow({
  id: 'wf.retry',
  inputSchema: z.object({}),
  outputSchema: z.object({ ok: z.literal(true) }),
})
  .then(flakyStep)
  .commit()

describe('retry transient', () => {
  beforeAll(() => {
    setDurableSql(runnerSql)
    setResumeSql(runnerSql)
  })

  beforeEach(async () => {
    calls = 0
    workflowRegistry.__resetForTests()
    __resetQueueRegistryForTests()
    workflowRegistry.register(wf)
    await clearWorkflow(sql, 'wf.retry')
  })

  afterAll(async () => {
    await sql.end()
  })

  it('succeeds after two 503s; one step row recorded', async () => {
    const r = await asTenant(TENANT_A, () => wf.run({}))
    expect(r.status).toBe('completed')
    expect(calls).toBe(3)

    const stepRows = await sql<
      Array<{ status: string; output: { ok: boolean } | null }>
    >`SELECT status, output FROM agent_workflows.workflow_steps WHERE workflow_id = 'wf.retry'`
    expect(stepRows).toHaveLength(1)
    expect(stepRows[0]?.status).toBe('completed')
    expect(stepRows[0]?.output).toEqual({ ok: true })
  })
})
