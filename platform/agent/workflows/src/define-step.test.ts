import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineStep } from './define-step'

describe('defineStep', () => {
  it('stores id, schemas, and execute', () => {
    const step = defineStep({
      id: 'review',
      inputSchema: z.object({ taskId: z.string() }),
      outputSchema: z.object({ approved: z.boolean() }),
      async execute(input) {
        return { approved: input.taskId.startsWith('ok') }
      },
    })

    expect(step.id).toBe('review')
    expect(step.inputSchema.safeParse({ taskId: 'abc' }).success).toBe(true)
    expect(step.outputSchema.safeParse({ approved: true }).success).toBe(true)
  })

  it('preserves id as a literal type at the type level', () => {
    const step = defineStep({
      id: 'review',
      inputSchema: z.object({ taskId: z.string() }),
      outputSchema: z.object({ approved: z.boolean() }),
      async execute() {
        return { approved: true }
      },
    })

    const id: 'review' = step.id
    expect(id).toBe('review')
  })

  describe('retry', () => {
    it('preserves retry config on returned Step', () => {
      const s = defineStep({
        id: 'r',
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        retry: { maxAttempts: 3 },
        async execute() {
          return {}
        },
      })
      expect(s.retry).toEqual({ maxAttempts: 3 })
    })

    it('omits retry when not configured', () => {
      const s = defineStep({
        id: 'r2',
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        async execute() {
          return {}
        },
      })
      expect(s.retry).toBeUndefined()
    })
  })
})
