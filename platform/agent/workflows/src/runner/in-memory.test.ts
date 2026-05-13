import { tenantContext } from '@seta/tenant'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createWorkflow } from '../create-workflow'
import { defineStep } from '../define-step'
import { StepInputValidationError, WorkflowError } from '../errors'

const tenantId = '00000000-0000-7000-8000-000000000001'

describe('in-memory runner — sequential', () => {
  it('runs a single .then() step end-to-end', async () => {
    const double = defineStep({
      id: 'double',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ x: z.number() }),
      async execute(input) {
        return { x: input.x * 2 }
      },
    })

    const wf = createWorkflow({
      id: 'wf.double',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ x: z.number() }),
    })
      .then(double)
      .commit()

    const out = await tenantContext.run({ tenantId }, () => wf.run({ x: 21 }))
    expect(out).toEqual({ x: 42 })
  })

  it('chains output → next step input', async () => {
    const inc = defineStep({
      id: 'inc',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ x: z.number() }),
      async execute(input) {
        return { x: input.x + 1 }
      },
    })
    const triple = defineStep({
      id: 'triple',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ x: z.number() }),
      async execute(input) {
        return { x: input.x * 3 }
      },
    })

    const wf = createWorkflow({
      id: 'wf.chain',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ x: z.number() }),
    })
      .then(inc)
      .then(triple)
      .commit()

    const out = await tenantContext.run({ tenantId }, () => wf.run({ x: 2 }))
    expect(out).toEqual({ x: 9 })
  })

  it('throws WorkflowError if run() is called without tenant context', async () => {
    const noop = defineStep({
      id: 'noop',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      async execute(input) {
        return input
      },
    })
    const wf = createWorkflow({
      id: 'wf.no-tenant',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
    })
      .then(noop)
      .commit()

    await expect(wf.run(null)).rejects.toThrow(WorkflowError)
  })

  it('propagates StepInputValidationError when workflow input does not match step input', async () => {
    const strict = defineStep({
      id: 'strict',
      inputSchema: z.object({ y: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      async execute(input) {
        return input
      },
    })

    const wf = createWorkflow({
      id: 'wf.bad-input',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.unknown(),
    })
      .then(strict as unknown as Parameters<ReturnType<typeof createWorkflow>['then']>[0])
      .commit()

    await expect(tenantContext.run({ tenantId }, () => wf.run({ x: 1 }))).rejects.toThrow(
      StepInputValidationError,
    )
  })
})
