import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createWorkflow } from './create-workflow'
import { defineStep } from './define-step'
import { WorkflowBuildError } from './errors'

const idStep = defineStep({
  id: 'identity',
  inputSchema: z.object({ x: z.number() }),
  outputSchema: z.object({ x: z.number() }),
  async execute(input) {
    return input
  },
})

describe('createWorkflow builder', () => {
  it('chains a single .then() and commits', () => {
    const wf = createWorkflow({
      id: 'wf.id',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ x: z.number() }),
    })
      .then(idStep)
      .commit()

    expect(wf.id).toBe('wf.id')
    expect(typeof wf.run).toBe('function')
  })

  it('throws on .then() after .commit()', () => {
    const wf = createWorkflow({
      id: 'wf.id2',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ x: z.number() }),
    })
      .then(idStep)
      .commit()

    expect(() => (wf as unknown as { then: (s: unknown) => unknown }).then(idStep)).toThrow(
      WorkflowBuildError,
    )
  })

  it('throws on duplicate chained step id', () => {
    expect(() =>
      createWorkflow({
        id: 'wf.dup',
        inputSchema: z.object({ x: z.number() }),
        outputSchema: z.object({ x: z.number() }),
      })
        .then(idStep)
        .then(idStep)
        .commit(),
    ).toThrow(/duplicate step id/i)
  })

  it('builder does not expose run() before commit()', () => {
    const builder = createWorkflow({
      id: 'wf.no-commit',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ x: z.number() }),
    }).then(idStep)

    expect((builder as unknown as { run?: unknown }).run).toBeUndefined()
  })

  it('throws on .commit() with no steps', () => {
    expect(() =>
      createWorkflow({
        id: 'wf.empty',
        inputSchema: z.object({ x: z.number() }),
        outputSchema: z.object({ x: z.number() }),
      }).commit(),
    ).toThrow(/at least one step required/i)
  })
})

describe('createWorkflow .parallel()', () => {
  const a = defineStep({
    id: 'a',
    inputSchema: z.object({ x: z.number() }),
    outputSchema: z.object({ a: z.number() }),
    async execute(input) {
      return { a: input.x + 1 }
    },
  })
  const b = defineStep({
    id: 'b',
    inputSchema: z.object({ x: z.number() }),
    outputSchema: z.object({ b: z.number() }),
    async execute(input) {
      return { b: input.x + 2 }
    },
  })

  it('accepts .parallel() and commits', () => {
    const wf = createWorkflow({
      id: 'wf.parallel',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ a: z.number(), b: z.number() }) as unknown as z.ZodType<{
        a: { a: number }
        b: { b: number }
      }>,
    })
      .parallel([a, b])
      .commit()

    expect(wf.id).toBe('wf.parallel')
  })

  it('throws on duplicate id between chained step and parallel branches', () => {
    const builder = createWorkflow({
      id: 'wf.dup-par',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.unknown(),
    }).then(a)
    expect(() =>
      (builder as unknown as { parallel: (steps: unknown[]) => unknown }).parallel([a, b]),
    ).toThrow(/duplicate step id/i)
  })
})
