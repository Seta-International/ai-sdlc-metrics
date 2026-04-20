import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAgentChatAdapter } from './agent-chat-adapter'
import { createAgentTurnStore } from './agent-turn-store'

// Mock @microsoft/fetch-event-source
vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn(),
}))

import { fetchEventSource } from '@microsoft/fetch-event-source'

const mockFetchEventSource = vi.mocked(fetchEventSource)

describe('AgentChatAdapter', () => {
  let store: ReturnType<typeof createAgentTurnStore>

  beforeEach(() => {
    store = createAgentTurnStore()
    vi.clearAllMocks()
  })

  it('calls POST /agent/turn with correct payload', async () => {
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'turn.ended', reason: 'completed' }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const adapter = createAgentChatAdapter({ endpoint: '/agent/turn', surface: 'panel', store })
    const gen = adapter.run({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
    })

    // Drain the generator
    const results = []
    for await (const chunk of gen as AsyncGenerator<any>) {
      results.push(chunk)
    }

    expect(mockFetchEventSource).toHaveBeenCalledWith(
      '/agent/turn',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: expect.stringContaining('"surface":"panel"'),
      }),
    )
  })

  it('yields accumulated text for answer.delta events', async () => {
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'answer.delta', text: 'Hello' }),
        event: '',
        id: '',
        retry: undefined,
      })
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'answer.delta', text: ' world' }),
        event: '',
        id: '',
        retry: undefined,
      })
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'turn.ended', reason: 'completed' }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const adapter = createAgentChatAdapter({ endpoint: '/agent/turn', surface: 'panel', store })
    const gen = adapter.run({
      messages: [] as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
    })

    const results: any[] = []
    for await (const chunk of gen as AsyncGenerator<any>) {
      results.push(chunk)
    }

    expect(results).toHaveLength(2)
    expect(results[0].content[0]).toEqual({ type: 'text', text: 'Hello' })
    expect(results[1].content[0]).toEqual({ type: 'text', text: 'Hello world' })
  })

  it('dispatches phase.started to the store', async () => {
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'phase.started', phase: 1, subAgents: ['planner'] }),
        event: '',
        id: '',
        retry: undefined,
      })
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'turn.ended', reason: 'completed' }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const adapter = createAgentChatAdapter({ endpoint: '/agent/turn', surface: 'panel', store })
    const gen = adapter.run({
      messages: [] as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
    })
    for await (const _ of gen as AsyncGenerator<any>) {
      /* drain */
    }

    expect(store.getState().phase).toBe(1)
    expect(store.getState().activeSubAgents).toEqual(['planner'])
  })

  it('dispatches draft.proposed to the store', async () => {
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({
          type: 'draft.proposed',
          draftId: 'dr-1',
          commandType: 'tasks.create',
          payload: {},
        }),
        event: '',
        id: '',
        retry: undefined,
      })
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'turn.ended', reason: 'completed' }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const adapter = createAgentChatAdapter({ endpoint: '/agent/turn', surface: 'panel', store })
    const gen = adapter.run({
      messages: [] as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
    })
    for await (const _ of gen as AsyncGenerator<any>) {
      /* drain */
    }

    expect(store.getState().drafts).toHaveLength(1)
    expect(store.getState().drafts[0].draftId).toBe('dr-1')
  })

  it('resets store at start of each run', async () => {
    // Put some state in the store first
    store.getState().dispatch({ type: 'phase.started', phase: 2, subAgents: ['old'] })

    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'turn.ended', reason: 'completed' }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const adapter = createAgentChatAdapter({ endpoint: '/agent/turn', surface: 'panel', store })
    const gen = adapter.run({
      messages: [] as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
    })
    for await (const _ of gen as AsyncGenerator<any>) {
      /* drain */
    }

    // Should have been reset at start of run
    expect(store.getState().activeSubAgents).toEqual([])
  })

  it('passes abortSignal to fetchEventSource', async () => {
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'turn.ended', reason: 'cancelled' }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const controller = new AbortController()
    const adapter = createAgentChatAdapter({ endpoint: '/agent/turn', surface: 'panel', store })
    const gen = adapter.run({
      messages: [] as any,
      abortSignal: controller.signal,
      context: {} as any,
    })
    for await (const _ of gen as AsyncGenerator<any>) {
      /* drain */
    }

    expect(mockFetchEventSource).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    )
  })
})
