import { tenantContext } from '@seta/tenant'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createWorkflow } from '../create-workflow'
import { defineStep } from '../define-step'
import { WorkflowError } from '../errors'

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
})

describe('in-memory runner — parallel', () => {
  it('runs parallel branches and produces a keyed record', async () => {
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

    const wf = createWorkflow({
      id: 'wf.par',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ a: z.number(), b: z.number() }) as unknown as z.ZodType<{
        a: { a: number }
        b: { b: number }
      }>,
    })
      .parallel([a, b])
      .commit()

    const out = await tenantContext.run({ tenantId }, () => wf.run({ x: 10 }))
    expect(out).toEqual({ a: { a: 11 }, b: { b: 12 } })
  })

  it('runs branches concurrently (overlapping execution windows)', async () => {
    const events: string[] = []
    const slow = (id: string, delayMs: number) =>
      defineStep({
        id,
        inputSchema: z.unknown(),
        outputSchema: z.object({ id: z.string() }),
        async execute() {
          events.push(`start:${id}`)
          await new Promise((r) => setTimeout(r, delayMs))
          events.push(`end:${id}`)
          return { id }
        },
      })

    const wf = createWorkflow({
      id: 'wf.par.concurrent',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
    })
      .parallel([slow('a', 30), slow('b', 10)])
      .commit()

    await tenantContext.run({ tenantId }, () => wf.run(null))

    const startA = events.indexOf('start:a')
    const startB = events.indexOf('start:b')
    const endA = events.indexOf('end:a')
    const endB = events.indexOf('end:b')
    expect(startA).toBeGreaterThanOrEqual(0)
    expect(startB).toBeGreaterThanOrEqual(0)
    expect(Math.max(startA, startB)).toBeLessThan(Math.min(endA, endB))
  })

  it('first rejecting branch aborts the run', async () => {
    const ok = defineStep({
      id: 'ok',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      async execute() {
        return null
      },
    })
    const bad = defineStep({
      id: 'bad',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      async execute() {
        throw new Error('branch failed')
      },
    })

    const wf = createWorkflow({
      id: 'wf.par.fail',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
    })
      .parallel([ok, bad])
      .commit()

    await expect(tenantContext.run({ tenantId }, () => wf.run(null))).rejects.toThrow(
      /step bad: execution failed/,
    )
  })

  it('aborts sibling branches via ctx.signal on first rejection', async () => {
    let siblingSawAbort = false
    const sibling = defineStep({
      id: 'sibling',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      async execute(_input, ctx) {
        await new Promise<void>((resolve) => {
          if (ctx.signal.aborted) {
            siblingSawAbort = true
            return resolve()
          }
          ctx.signal.addEventListener(
            'abort',
            () => {
              siblingSawAbort = true
              resolve()
            },
            { once: true },
          )
        })
        return null
      },
    })
    const fast = defineStep({
      id: 'fast',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      async execute() {
        await new Promise((r) => setTimeout(r, 5))
        throw new Error('fast branch failed')
      },
    })

    const wf = createWorkflow({
      id: 'wf.par.cancel',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
    })
      .parallel([sibling, fast])
      .commit()

    await expect(tenantContext.run({ tenantId }, () => wf.run(null))).rejects.toThrow(
      /step fast: execution failed/,
    )
    expect(siblingSawAbort).toBe(true)
  })

  it('honours an externally-supplied AbortSignal', async () => {
    let stepSawAbort = false
    const slow = defineStep({
      id: 'slow',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      async execute(_input, ctx) {
        await new Promise<void>((resolve) => {
          if (ctx.signal.aborted) {
            stepSawAbort = true
            return resolve()
          }
          ctx.signal.addEventListener(
            'abort',
            () => {
              stepSawAbort = true
              resolve()
            },
            { once: true },
          )
        })
        return null
      },
    })

    const wf = createWorkflow({
      id: 'wf.ext.signal',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
    })
      .then(slow)
      .commit()

    const controller = new AbortController()
    const runPromise = tenantContext.run({ tenantId }, () =>
      wf.run(null, { signal: controller.signal }),
    )
    await new Promise((r) => setTimeout(r, 5))
    controller.abort(new Error('cancelled'))
    await runPromise.catch(() => {})
    expect(stepSawAbort).toBe(true)
  })
})
