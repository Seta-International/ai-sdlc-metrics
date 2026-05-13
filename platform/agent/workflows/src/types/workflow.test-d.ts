import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { createWorkflow } from '../create-workflow'
import { defineStep } from '../define-step'
import type { RunResult } from './result'

const stepIn = defineStep({
  id: 'in',
  inputSchema: z.object({ x: z.number() }),
  outputSchema: z.object({ y: z.number() }),
  async execute(input) {
    return { y: input.x + 1 }
  },
})

const stepNext = defineStep({
  id: 'next',
  inputSchema: z.object({ y: z.number() }),
  outputSchema: z.object({ z: z.string() }),
  async execute(input) {
    return { z: String(input.y) }
  },
})

const stepMismatch = defineStep({
  id: 'mismatch',
  inputSchema: z.object({ totally: z.string(), different: z.boolean() }),
  outputSchema: z.unknown(),
  async execute() {
    return null
  },
})

const branchA = defineStep({
  id: 'a',
  inputSchema: z.object({ y: z.number() }),
  outputSchema: z.object({ aOut: z.number() }),
  async execute(input) {
    return { aOut: input.y }
  },
})

const branchB = defineStep({
  id: 'b',
  inputSchema: z.object({ y: z.number() }),
  outputSchema: z.object({ bOut: z.string() }),
  async execute(input) {
    return { bOut: String(input.y) }
  },
})

describe('workflow type tests', () => {
  it('chains step outputs to next step inputs', () => {
    const wf = createWorkflow({
      id: 'wf.t1',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ z: z.string() }),
    })
      .then(stepIn)
      .then(stepNext)
      .commit()

    expectTypeOf(wf.run).parameter(0).toEqualTypeOf<{ x: number }>()
    expectTypeOf(wf.run).returns.toEqualTypeOf<Promise<RunResult<{ z: string }>>>()
  })

  it('rejects a .then() whose input schema does not match upstream output', () => {
    const builder = createWorkflow({
      id: 'wf.t2',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.unknown(),
    }).then(stepIn)

    // @ts-expect-error stepMismatch.inputSchema is incompatible with stepIn's output
    builder.then(stepMismatch)
  })

  it('.parallel() produces a keyed record by step id', () => {
    const wf = createWorkflow({
      id: 'wf.t3',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({
        a: z.object({ aOut: z.number() }),
        b: z.object({ bOut: z.string() }),
      }) as unknown as z.ZodType<{ a: { aOut: number }; b: { bOut: string } }>,
    })
      .then(stepIn)
      .parallel([branchA, branchB])
      .commit()

    expectTypeOf(wf.run).returns.toEqualTypeOf<
      Promise<RunResult<{ a: { aOut: number }; b: { bOut: string } }>>
    >()
  })

  it('post-.commit() chaining is a TS error', () => {
    const wf = createWorkflow({
      id: 'wf.t4',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
    })
      .then(stepIn)
      .commit()

    // @ts-expect-error then() after commit() is typed never
    wf.then(stepIn)
    // @ts-expect-error parallel() after commit() is typed never
    wf.parallel([stepIn])
    // @ts-expect-error commit() after commit() is typed never
    wf.commit()
  })
})
