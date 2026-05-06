import { describe, it, expect } from 'vitest'
import { isPlanArgs, isIterationArgs, isDraftArgs } from './agent-message-parts'

describe('agent message part type guards', () => {
  it('isPlanArgs accepts a well-formed plan part', () => {
    expect(
      isPlanArgs({
        traceId: 'abc',
        conversationId: null,
        topology: 'bounded',
        phase: 1,
        subAgents: [{ domain: 'planner' }],
      }),
    ).toBe(true)
  })

  it('isPlanArgs rejects invalid input', () => {
    expect(isPlanArgs({})).toBe(false)
    expect(isPlanArgs(null)).toBe(false)
  })

  it('isIterationArgs accepts running iteration', () => {
    expect(
      isIterationArgs({
        n: 1,
        subAgentDomain: 'planner',
        selectionReason: 'first match',
        state: 'running',
      }),
    ).toBe(true)
  })

  it('isDraftArgs accepts a well-formed draft part', () => {
    expect(
      isDraftArgs({
        actionId: 'a1',
        summary: 'Approve leave',
        tier: 'high',
        requiresApproval: true,
        provenance: { sub_agent_domain: 'people', trace_id: 't1' },
      }),
    ).toBe(true)
  })

  it('isDraftArgs rejects invalid tier', () => {
    expect(
      isDraftArgs({
        actionId: 'a1',
        summary: 'x',
        tier: 'urgent',
        requiresApproval: false,
        provenance: { sub_agent_domain: 'people', trace_id: 't1' },
      }),
    ).toBe(false)
  })

  it('isIterationArgs rejects invalid input', () => {
    expect(isIterationArgs({})).toBe(false)
    expect(
      isIterationArgs({ n: 1, subAgentDomain: 'x', selectionReason: 'y', state: 'pending' }),
    ).toBe(false)
  })

  it('isPlanArgs rejects invalid topology', () => {
    expect(
      isPlanArgs({
        traceId: 'x',
        conversationId: null,
        topology: 'unknown',
        phase: null,
        subAgents: [],
      }),
    ).toBe(false)
  })
})
