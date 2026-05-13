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

const step1 = defineStep({
  id: 'step1',
  inputSchema: z.object({ taskId: z.string() }),
  outputSchema: z.object({ taskId: z.string(), step: z.literal('one') }),
  async execute(input) {
    return { taskId: input.taskId, step: 'one' as const }
  },
})

const hitlStep = defineStep({
  id: 'hitl',
  inputSchema: z.object({ taskId: z.string(), step: z.literal('one') }),
  outputSchema: z.object({ approved: z.boolean() }),
  async execute(_input, ctx) {
    const decision = ctx.resumePayload as { approved: boolean } | undefined
    if (!decision) {
      ctx.suspend({ resumeLabel: 'manager-approval' })
    }
    return { approved: decision.approved }
  },
})

const finalStep = defineStep({
  id: 'finalize',
  inputSchema: z.object({ approved: z.boolean() }),
  outputSchema: z.object({ done: z.literal(true) }),
  async execute() {
    return { done: true as const }
  },
})

const wf = createWorkflow({
  id: 'wf.golden',
  inputSchema: z.object({ taskId: z.string() }),
  outputSchema: z.object({ done: z.literal(true) }),
})
  .then(step1)
  .then(hitlStep)
  .then(finalStep)
  .commit()

describe('golden path: run → suspend → resume → complete', () => {
  beforeAll(() => {
    setDurableSql(runnerSql)
    setResumeSql(runnerSql)
  })

  beforeEach(async () => {
    workflowRegistry.__resetForTests()
    __resetQueueRegistryForTests()
    workflowRegistry.register(wf)
    await clearWorkflow(sql, 'wf.golden')
  })

  afterAll(async () => {
    await sql.end()
  })

  it('suspends on hitl, resumes with approval, completes', async () => {
    const first = await asTenant(TENANT_A, () => wf.run({ taskId: 'T-1' }))
    expect(first.status).toBe('suspended')
    if (first.status !== 'suspended') return
    expect(first.resumeLabel).toBe('manager-approval')
    expect(first.stepId).toBe('hitl')

    const second = await asTenant(TENANT_A, () =>
      wf.resume(first.runId, { label: 'manager-approval', payload: { approved: true } }),
    )
    expect(second.status).toBe('completed')
    if (second.status === 'completed') {
      expect(second.output).toEqual({ done: true })
    }

    const audit = await sql<Array<{ operation: string }>>`
      SELECT operation FROM audit.audit_log
      WHERE tenant_id = ${TENANT_A}
        AND metadata->>'workflowId' = 'wf.golden'
      ORDER BY id ASC
    `
    expect(audit.map((r) => r.operation)).toEqual([
      'workflow.started',
      'workflow.suspended',
      'workflow.resumed',
      'workflow.completed',
    ])
  })
})
