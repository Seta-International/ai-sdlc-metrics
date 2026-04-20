import { describe, it, expect } from 'vitest'
import { sseEventSchema } from './sse-event-schema'

describe('sseEventSchema', () => {
  it('parses answer.delta', () => {
    const result = sseEventSchema.parse({ type: 'answer.delta', text: 'Hello' })
    expect(result).toEqual({ type: 'answer.delta', text: 'Hello' })
  })

  it('parses answer.complete', () => {
    const result = sseEventSchema.parse({ type: 'answer.complete' })
    expect(result).toEqual({ type: 'answer.complete' })
  })

  it('parses answer.shape_declared', () => {
    const result = sseEventSchema.parse({ type: 'answer.shape_declared', shape: 'table' })
    expect(result).toEqual({ type: 'answer.shape_declared', shape: 'table' })
  })

  it('parses phase.started', () => {
    const result = sseEventSchema.parse({
      type: 'phase.started',
      phase: 1,
      subAgents: ['planner', 'people'],
    })
    expect(result).toEqual({ type: 'phase.started', phase: 1, subAgents: ['planner', 'people'] })
  })

  it('parses refusal', () => {
    const result = sseEventSchema.parse({ type: 'refusal', reason: 'insufficient permissions' })
    expect(result).toEqual({ type: 'refusal', reason: 'insufficient permissions' })
  })

  it('parses draft.proposed', () => {
    const result = sseEventSchema.parse({
      type: 'draft.proposed',
      draftId: 'draft-123',
      commandType: 'tasks.create',
      payload: { title: 'New task' },
    })
    expect(result.type).toBe('draft.proposed')
    expect(result.draftId).toBe('draft-123')
  })

  it('parses turn.ended with each valid reason', () => {
    for (const reason of [
      'completed',
      'refused',
      'budget',
      'moderation',
      'cancelled',
      'ceiling',
    ] as const) {
      const result = sseEventSchema.parse({ type: 'turn.ended', reason })
      expect(result).toEqual({ type: 'turn.ended', reason })
    }
  })

  it('rejects unknown event type', () => {
    expect(() => sseEventSchema.parse({ type: 'unknown.event' })).toThrow()
  })

  it('rejects turn.ended with unknown reason', () => {
    expect(() => sseEventSchema.parse({ type: 'turn.ended', reason: 'flying' })).toThrow()
  })
})
