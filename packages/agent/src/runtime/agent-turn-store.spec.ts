import { describe, it, expect, beforeEach } from 'vitest'
import { createAgentTurnStore } from './agent-turn-store'

const minUsage = {
  input_tokens: 10,
  output_tokens: 5,
  input_cached_read: 0,
  input_cached_write: 0,
  output_reasoning: 0,
}

describe('agentTurnStore', () => {
  let store: ReturnType<typeof createAgentTurnStore>

  beforeEach(() => {
    store = createAgentTurnStore()
  })

  it('has correct initial state', () => {
    const state = store.getState()
    expect(state.phase).toBeNull()
    expect(state.activeSubAgents).toEqual([])
    expect(state.shape).toBeNull()
    expect(state.drafts).toEqual([])
    expect(state.isRefused).toBe(false)
    expect(state.refusalReason).toBeNull()
    expect(state.isEnded).toBe(false)
    expect(state.endReason).toBeNull()
    expect(state.traceId).toBeNull()
    expect(state.topology).toBeNull()
  })

  it('dispatches turn.started', () => {
    store.getState().dispatch({
      seq: 1,
      type: 'turn.started',
      payload: { trace_id: 'tr-abc', conversation_id: 'conv-1', topology: 'bounded' },
    })
    expect(store.getState().traceId).toBe('tr-abc')
    expect(store.getState().topology).toBe('bounded')
  })

  it('dispatches phase.started with sub_agents', () => {
    store.getState().dispatch({
      seq: 2,
      type: 'phase.started',
      payload: {
        phase: 1,
        sub_agents: [{ domain: 'planner' }, { domain: 'people' }],
      },
    })
    expect(store.getState().phase).toBe(1)
    expect(store.getState().activeSubAgents).toEqual(['planner', 'people'])
  })

  it('dispatches iteration.started', () => {
    store.getState().dispatch({
      seq: 3,
      type: 'iteration.started',
      payload: { n: 1, sub_agent_domain: 'planner', selection_reason: 'first' },
    })
    // No throw = pass (store ignores or handles gracefully)
    expect(store.getState().phase).toBeNull()
  })

  it('dispatches iteration.validated', () => {
    store.getState().dispatch({
      seq: 4,
      type: 'iteration.validated',
      payload: {
        n: 1,
        passed: true,
        scorer_results: [{ scorer: 'relevance', passed: true }],
        max_iterations_reached: false,
      },
    })
    // No throw = pass
    expect(store.getState().phase).toBeNull()
  })

  it('dispatches iteration.ended', () => {
    store.getState().dispatch({
      seq: 5,
      type: 'iteration.ended',
      payload: { n: 1, is_complete: false, usage: minUsage },
    })
    // No throw = pass
    expect(store.getState().phase).toBeNull()
  })

  it('dispatches progress', () => {
    store.getState().dispatch({
      seq: 6,
      type: 'progress',
      payload: { message: 'Fetching data...' },
    })
    // No throw = pass
    expect(store.getState().phase).toBeNull()
  })

  it('dispatches answer.shape_declared from payload.shape', () => {
    store.getState().dispatch({
      seq: 8,
      type: 'answer.shape_declared',
      payload: { shape: 'table' },
    })
    expect(store.getState().shape).toBe('table')
  })

  it('dispatches answer.token (text events belong to adapter — no store mutation)', () => {
    store.getState().dispatch({
      seq: 9,
      type: 'answer.token',
      payload: { text: 'hello' },
    })
    // No state change
    const state = store.getState()
    expect(state.phase).toBeNull()
    expect(state.drafts).toEqual([])
  })

  it('dispatches answer.complete (no store mutation)', () => {
    store.getState().dispatch({
      seq: 10,
      type: 'answer.complete',
      payload: { shape: 'narrative', content: 'Full text', citations: [] },
    })
    const state = store.getState()
    expect(state.phase).toBeNull()
    expect(state.drafts).toEqual([])
  })

  it('dispatches draft.proposed and appends to drafts with new shape', () => {
    store.getState().dispatch({
      seq: 11,
      type: 'draft.proposed',
      payload: {
        action_id: 'act-1',
        summary: 'Create task',
        tier: 'low',
        requires_approval: false,
        provenance: { sub_agent_domain: 'planner', trace_id: 'tr-1' },
      },
    })
    store.getState().dispatch({
      seq: 12,
      type: 'draft.proposed',
      payload: {
        action_id: 'act-2',
        summary: 'Delete record',
        tier: 'high',
        requires_approval: true,
        provenance: { sub_agent_domain: 'people', trace_id: 'tr-1' },
      },
    })
    expect(store.getState().drafts).toHaveLength(2)
    expect(store.getState().drafts[0].action_id).toBe('act-1')
    expect(store.getState().drafts[0].tier).toBe('low')
    expect(store.getState().drafts[1].action_id).toBe('act-2')
    expect(store.getState().drafts[1].requires_approval).toBe(true)
  })

  it('dispatches refusal.started from payload', () => {
    store.getState().dispatch({
      seq: 13,
      type: 'refusal.started',
      payload: { reason: 'daily_budget', retry_allowed: false },
    })
    expect(store.getState().isRefused).toBe(true)
    expect(store.getState().refusalReason).toBe('daily_budget')
  })

  it('dispatches turn.ended from payload.reason', () => {
    store.getState().dispatch({
      seq: 14,
      type: 'turn.ended',
      payload: { reason: 'budget', usage: minUsage },
    })
    expect(store.getState().isEnded).toBe(true)
    expect(store.getState().endReason).toBe('budget')
  })

  it('reset clears all state', () => {
    store.getState().dispatch({
      seq: 2,
      type: 'phase.started',
      payload: { phase: 2, sub_agents: [{ domain: 'people' }] },
    })
    store.getState().dispatch({
      seq: 7,
      type: 'refusal.started',
      payload: { reason: 'internal', retry_allowed: false },
    })
    store.getState().reset()
    const state = store.getState()
    expect(state.phase).toBeNull()
    expect(state.isRefused).toBe(false)
    expect(state.activeSubAgents).toEqual([])
    expect(state.traceId).toBeNull()
    expect(state.topology).toBeNull()
  })
})

describe('streaming flag', () => {
  it('is false initially', () => {
    const store = createAgentTurnStore()
    expect(store.getState().streaming).toBe(false)
  })

  it('flips true on turn.started and false on turn.ended', () => {
    const store = createAgentTurnStore()
    store.getState().dispatch({
      seq: 1,
      type: 'turn.started',
      payload: { trace_id: 't1', conversation_id: null, topology: 'bounded' },
    })
    expect(store.getState().streaming).toBe(true)
    store.getState().dispatch({
      seq: 9,
      type: 'turn.ended',
      payload: {
        reason: 'completed',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          input_cached_read: 0,
          input_cached_write: 0,
          output_reasoning: 0,
        },
      },
    })
    expect(store.getState().streaming).toBe(false)
  })

  it('flips false on refusal.started', () => {
    const store = createAgentTurnStore()
    store.getState().dispatch({
      seq: 1,
      type: 'turn.started',
      payload: { trace_id: 't1', conversation_id: null, topology: 'bounded' },
    })
    store.getState().dispatch({
      seq: 2,
      type: 'refusal.started',
      payload: { reason: 'rate_limit', retry_allowed: false },
    })
    expect(store.getState().streaming).toBe(false)
  })

  it('reset() returns streaming to false', () => {
    const store = createAgentTurnStore()
    store.getState().dispatch({
      seq: 1,
      type: 'turn.started',
      payload: { trace_id: 't1', conversation_id: null, topology: 'bounded' },
    })
    store.getState().reset()
    expect(store.getState().streaming).toBe(false)
  })
})

describe('usage snapshot', () => {
  it('captures last usage from iteration.ended', () => {
    const store = createAgentTurnStore()
    store.getState().dispatch({
      seq: 5,
      type: 'iteration.ended',
      payload: {
        n: 1,
        is_complete: true,
        usage: {
          input_tokens: 20,
          output_tokens: 8,
          input_cached_read: 0,
          input_cached_write: 0,
          output_reasoning: 0,
        },
      },
    })
    expect(store.getState().usage).toEqual({
      input_tokens: 20,
      output_tokens: 8,
      input_cached_read: 0,
      input_cached_write: 0,
      output_reasoning: 0,
    })
  })

  it('overwrites usage on later turn.ended', () => {
    const store = createAgentTurnStore()
    store.getState().dispatch({
      seq: 5,
      type: 'iteration.ended',
      payload: {
        n: 1,
        is_complete: false,
        usage: {
          input_tokens: 20,
          output_tokens: 8,
          input_cached_read: 0,
          input_cached_write: 0,
          output_reasoning: 0,
        },
      },
    })
    store.getState().dispatch({
      seq: 9,
      type: 'turn.ended',
      payload: {
        reason: 'completed',
        usage: {
          input_tokens: 30,
          output_tokens: 12,
          input_cached_read: 0,
          input_cached_write: 0,
          output_reasoning: 0,
        },
      },
    })
    expect(store.getState().usage?.input_tokens).toBe(30)
    expect(store.getState().usage?.output_tokens).toBe(12)
  })
})
