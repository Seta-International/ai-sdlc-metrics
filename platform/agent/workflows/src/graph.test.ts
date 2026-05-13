import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineStep } from './define-step'
import { type GraphNode, parallel, single } from './graph'

const s = (id: string) =>
  defineStep({
    id,
    inputSchema: z.unknown(),
    outputSchema: z.unknown(),
    async execute() {
      return null
    },
  })

describe('workflow graph nodes', () => {
  it('single() produces a single node', () => {
    const node: GraphNode = single(s('a'))
    expect(node.kind).toBe('single')
    if (node.kind === 'single') expect(node.step.id).toBe('a')
  })

  it('parallel() produces a parallel node with the given branches', () => {
    const node = parallel([s('a'), s('b')])
    expect(node.kind).toBe('parallel')
    if (node.kind === 'parallel') {
      expect(node.branches.map((b) => b.id)).toEqual(['a', 'b'])
    }
  })

  it('parallel() rejects duplicate branch ids at build time', () => {
    expect(() => parallel([s('a'), s('a')])).toThrow(/duplicate step id/i)
  })

  it('parallel() rejects empty branch arrays', () => {
    expect(() => parallel([])).toThrow(/at least one/i)
  })
})
