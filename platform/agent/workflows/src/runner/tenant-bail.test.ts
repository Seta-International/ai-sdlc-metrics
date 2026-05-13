import { tenantContext } from '@seta/tenant'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createWorkflow } from '../create-workflow'
import { defineStep } from '../define-step'
import { WorkflowBailed } from '../errors'

const tenantId = '00000000-0000-7000-8000-000000000002'

describe('runner — tenant + bail', () => {
  it('tenantContext is propagated inside every step body', async () => {
    let seenTenant: string | undefined
    const peek = defineStep({
      id: 'peek',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      async execute() {
        seenTenant = tenantContext.getTenantId()
        return null
      },
    })

    const wf = createWorkflow({
      id: 'wf.tenant',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
    })
      .then(peek)
      .commit()

    await tenantContext.run({ tenantId }, () => wf.run(null))
    expect(seenTenant).toBe(tenantId)
  })

  it('ctx.bail() rejects the run with WorkflowBailed', async () => {
    const bail = defineStep({
      id: 'bail',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      async execute(_input, ctx) {
        return ctx.bail('done early')
      },
    })

    const wf = createWorkflow({
      id: 'wf.bail',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
    })
      .then(bail)
      .commit()

    await expect(tenantContext.run({ tenantId }, () => wf.run(null))).rejects.toThrow(
      WorkflowBailed,
    )
  })

  it('tenantContext is propagated inside each parallel branch', async () => {
    const seen: string[] = []
    const peekBranch = (id: string) =>
      defineStep({
        id,
        inputSchema: z.unknown(),
        outputSchema: z.unknown(),
        async execute() {
          seen.push(tenantContext.getTenantId())
          return null
        },
      })

    const wf = createWorkflow({
      id: 'wf.tenant.par',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
    })
      .parallel([peekBranch('a'), peekBranch('b')])
      .commit()

    await tenantContext.run({ tenantId }, () => wf.run(null))
    expect(seen.sort()).toEqual([tenantId, tenantId])
  })
})
