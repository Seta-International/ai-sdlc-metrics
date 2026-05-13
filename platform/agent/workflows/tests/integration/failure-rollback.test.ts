import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createWorkflow,
  defineStep,
  setDurableSql,
  setResumeSql,
  WorkflowNotSuspended,
  workflowRegistry,
} from '../../src'
import { __resetQueueRegistryForTests } from '../../src/runner/queue'
import { clearWorkflow, getAdminPool, getPool } from './support/db'
import { asTenant, TENANT_A } from './support/tenant'

const runnerSql = getPool()
const sql = getAdminPool()

const failStep = defineStep({
  id: 'fail',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  async execute() {
    const e = new Error('hard fail') as Error & { status: number }
    e.status = 400
    throw e
  },
})

const wf = createWorkflow({
  id: 'wf.fail',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
})
  .then(failStep)
  .commit()

describe('failure rollback', () => {
  beforeAll(() => {
    setDurableSql(runnerSql)
    setResumeSql(runnerSql)
  })

  beforeEach(async () => {
    workflowRegistry.__resetForTests()
    __resetQueueRegistryForTests()
    workflowRegistry.register(wf)
    await clearWorkflow(sql, 'wf.fail')
  })

  afterAll(async () => {
    await sql.end()
  })

  it('run resolves to failed; resume throws WorkflowNotSuspended', async () => {
    const r = await asTenant(TENANT_A, () => wf.run({}))
    expect(r.status).toBe('failed')
    if (r.status !== 'failed') return

    await expect(
      asTenant(TENANT_A, () => wf.resume(r.runId, { label: 'whatever' })),
    ).rejects.toBeInstanceOf(WorkflowNotSuspended)

    const audit = await sql<Array<{ operation: string }>>`
      SELECT operation FROM audit.audit_log
      WHERE tenant_id = ${TENANT_A} AND metadata->>'workflowId' = 'wf.fail'
      ORDER BY id ASC
    `
    expect(audit.map((x) => x.operation)).toContain('workflow.failed')
  })
})
