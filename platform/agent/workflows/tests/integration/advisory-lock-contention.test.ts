import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createWorkflow,
  defineStep,
  setDurableSql,
  setResumeSql,
  WorkflowNotSuspended,
  WorkflowResumeContended,
  workflowRegistry,
} from '../../src'
import { __resetQueueRegistryForTests } from '../../src/runner/queue'
import { clearWorkflow, getAdminPool, getPool } from './support/db'
import { asTenant, TENANT_A } from './support/tenant'

const runnerSql = getPool()
const sql = getAdminPool()

const slowStep = defineStep({
  id: 's',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  async execute(_input, ctx) {
    if (!ctx.resumePayload) ctx.suspend({ resumeLabel: 'go' })
    return {}
  },
})

const wf = createWorkflow({
  id: 'wf.contend',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
})
  .then(slowStep)
  .commit()

describe('resume advisory-lock contention', () => {
  beforeAll(() => {
    setDurableSql(runnerSql)
    setResumeSql(runnerSql)
  })

  beforeEach(async () => {
    workflowRegistry.__resetForTests()
    __resetQueueRegistryForTests()
    workflowRegistry.register(wf)
    await clearWorkflow(sql, 'wf.contend')
  })

  afterAll(async () => {
    await sql.end()
  })

  it('two concurrent resume callers: exactly one wins', async () => {
    const first = await asTenant(TENANT_A, () => wf.run({}))
    if (first.status !== 'suspended') throw new Error('expected suspended')

    const both = await Promise.allSettled([
      asTenant(TENANT_A, () => wf.resume(first.runId, { label: 'go', payload: { ok: true } })),
      asTenant(TENANT_A, () => wf.resume(first.runId, { label: 'go', payload: { ok: true } })),
    ])

    const completed = both.filter(
      (r) => r.status === 'fulfilled' && (r.value as { status: string }).status === 'completed',
    )
    const losers = both.filter(
      (r) =>
        r.status === 'rejected' &&
        (r.reason instanceof WorkflowResumeContended || r.reason instanceof WorkflowNotSuspended),
    )

    expect(completed.length).toBe(1)
    expect(losers.length).toBe(1)
  })
})
