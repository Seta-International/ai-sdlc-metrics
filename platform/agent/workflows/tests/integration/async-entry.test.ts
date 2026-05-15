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

const step = defineStep({
  id: 'noop',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  async execute() {
    return {}
  },
})

const wf = createWorkflow({
  id: 'wf.async',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
})
  .then(step)
  .commit()

describe('runAsync', () => {
  beforeAll(() => {
    setDurableSql(runnerSql)
    setResumeSql(runnerSql)
  })

  beforeEach(async () => {
    workflowRegistry.__resetForTests()
    __resetQueueRegistryForTests()
    workflowRegistry.register(wf)
    await clearWorkflow(sql, 'wf.async')
  })

  afterAll(async () => {
    await sql.end()
  })

  it('returns { runId } immediately; snapshot reaches completed', async () => {
    const r = await asTenant(TENANT_A, () => wf.runAsync({}))
    expect(r.runId).toBeTruthy()
    const runId = r.runId

    const deadline = Date.now() + 5_000
    let status = 'running'
    while (Date.now() < deadline) {
      const rows: Array<{ status: string }> = await sql`
        SELECT status FROM agent_workflows.workflow_snapshots WHERE run_id = ${runId}::uuid
      `
      status = rows[0]?.status ?? 'missing'
      if (status === 'completed' || status === 'failed') break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(status).toBe('completed')
  })
})
