import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createWorkflow,
  defineStep,
  resumeWorkflow,
  setDurableSql,
  setResumeSql,
  WorkflowSnapshotNotFound,
  workflowRegistry,
} from '../../src'
import { __resetQueueRegistryForTests } from '../../src/runner/queue'
import { clearWorkflow, getAdminPool, getPool } from './support/db'
import { asTenant, TENANT_A, TENANT_B } from './support/tenant'

const runnerSql = getPool()
const sql = getAdminPool()

const hitlStep = defineStep({
  id: 'hitl',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  async execute(_input, ctx) {
    if (ctx.resumePayload === undefined) ctx.suspend({ resumeLabel: 'approve' })
    return {}
  },
})

const wf = createWorkflow({
  id: 'wf.rls',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
})
  .then(hitlStep)
  .commit()

describe('RLS isolation: tenant B cannot resume tenant A', () => {
  beforeAll(() => {
    setDurableSql(runnerSql)
    setResumeSql(runnerSql)
  })

  beforeEach(async () => {
    workflowRegistry.__resetForTests()
    __resetQueueRegistryForTests()
    workflowRegistry.register(wf)
    await clearWorkflow(sql, 'wf.rls')
  })

  afterAll(async () => {
    await sql.end()
  })

  it('tenant B sees WorkflowSnapshotNotFound', async () => {
    const a = await asTenant(TENANT_A, () => wf.run({}))
    if (a.status !== 'suspended') throw new Error('expected suspended')

    await expect(
      asTenant(TENANT_B, () => resumeWorkflow(a.runId, { label: 'approve' })),
    ).rejects.toBeInstanceOf(WorkflowSnapshotNotFound)
  })
})
