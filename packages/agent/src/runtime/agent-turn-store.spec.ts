import { describe, it, expect, beforeEach } from 'vitest'
import { createAgentTurnStore } from './agent-turn-store'

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
  })

  it('dispatches phase.started', () => {
    store.getState().dispatch({ type: 'phase.started', phase: 1, subAgents: ['planner'] })
    expect(store.getState().phase).toBe(1)
    expect(store.getState().activeSubAgents).toEqual(['planner'])
  })

  it('dispatches answer.shape_declared', () => {
    store.getState().dispatch({ type: 'answer.shape_declared', shape: 'table' })
    expect(store.getState().shape).toBe('table')
  })

  it('dispatches draft.proposed and appends to drafts', () => {
    store.getState().dispatch({
      type: 'draft.proposed',
      draftId: 'draft-1',
      commandType: 'tasks.create',
      payload: { title: 'Task A' },
    })
    store.getState().dispatch({
      type: 'draft.proposed',
      draftId: 'draft-2',
      commandType: 'tasks.update',
      payload: { id: 'task-99' },
    })
    expect(store.getState().drafts).toHaveLength(2)
    expect(store.getState().drafts[0].draftId).toBe('draft-1')
    expect(store.getState().drafts[1].draftId).toBe('draft-2')
  })

  it('dispatches refusal', () => {
    store.getState().dispatch({ type: 'refusal', reason: 'no permission' })
    expect(store.getState().isRefused).toBe(true)
    expect(store.getState().refusalReason).toBe('no permission')
  })

  it('dispatches turn.ended', () => {
    store.getState().dispatch({ type: 'turn.ended', reason: 'budget' })
    expect(store.getState().isEnded).toBe(true)
    expect(store.getState().endReason).toBe('budget')
  })

  it('reset clears all state', () => {
    store.getState().dispatch({ type: 'phase.started', phase: 2, subAgents: ['people'] })
    store.getState().dispatch({ type: 'refusal', reason: 'moderation' })
    store.getState().reset()
    const state = store.getState()
    expect(state.phase).toBeNull()
    expect(state.isRefused).toBe(false)
    expect(state.activeSubAgents).toEqual([])
  })

  it('ignores answer.delta and answer.complete (text events belong to adapter)', () => {
    // These events are yielded by the adapter — the store does not mutate for them
    store.getState().dispatch({ type: 'answer.delta', text: 'hello' })
    store.getState().dispatch({ type: 'answer.complete' })
    // No state change expected
    const state = store.getState()
    expect(state.phase).toBeNull()
    expect(state.drafts).toEqual([])
  })
})
