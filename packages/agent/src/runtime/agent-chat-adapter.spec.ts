import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAgentChatAdapter } from './agent-chat-adapter'
import { createAgentTurnStore } from './agent-turn-store'

// Mock @microsoft/fetch-event-source
vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn(),
}))

import { fetchEventSource } from '@microsoft/fetch-event-source'

const mockFetchEventSource = vi.mocked(fetchEventSource)

const minUsage = {
  input_tokens: 10,
  output_tokens: 5,
  input_cached_read: 0,
  input_cached_write: 0,
  output_reasoning: 0,
}

describe('AgentChatAdapter', () => {
  let store: ReturnType<typeof createAgentTurnStore>

  beforeEach(() => {
    store = createAgentTurnStore()
    vi.clearAllMocks()
  })

  it('calls POST /agent/turn with correct payload', async () => {
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({
          seq: 1,
          type: 'turn.ended',
          payload: { reason: 'completed', usage: minUsage },
        }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const adapter = createAgentChatAdapter({
      endpoint: '/agent/turn',
      surface: 'panel',
      store,
      getExecutionMode: () => 'default' as const,
    })
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

  it('yields accumulated text for answer.token events', async () => {
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({ seq: 1, type: 'answer.token', payload: { text: 'Hello' } }),
        event: '',
        id: '',
        retry: undefined,
      })
      opts?.onmessage?.({
        data: JSON.stringify({ seq: 2, type: 'answer.token', payload: { text: ' world' } }),
        event: '',
        id: '',
        retry: undefined,
      })
      opts?.onmessage?.({
        data: JSON.stringify({
          seq: 3,
          type: 'turn.ended',
          payload: { reason: 'completed', usage: minUsage },
        }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const adapter = createAgentChatAdapter({
      endpoint: '/agent/turn',
      surface: 'panel',
      store,
      getExecutionMode: () => 'default' as const,
    })
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

  it('dispatches phase.started to the store with sub_agents', async () => {
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({
          seq: 1,
          type: 'phase.started',
          payload: { phase: 1, sub_agents: [{ domain: 'planner' }] },
        }),
        event: '',
        id: '',
        retry: undefined,
      })
      opts?.onmessage?.({
        data: JSON.stringify({
          seq: 2,
          type: 'turn.ended',
          payload: { reason: 'completed', usage: minUsage },
        }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const adapter = createAgentChatAdapter({
      endpoint: '/agent/turn',
      surface: 'panel',
      store,
      getExecutionMode: () => 'default' as const,
    })
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

  it('dispatches draft.proposed to the store with new shape', async () => {
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({
          seq: 1,
          type: 'draft.proposed',
          payload: {
            action_id: 'act-1',
            summary: 'Create a task',
            tier: 'low',
            requires_approval: false,
            provenance: { sub_agent_domain: 'planner', trace_id: 'tr-1' },
          },
        }),
        event: '',
        id: '',
        retry: undefined,
      })
      opts?.onmessage?.({
        data: JSON.stringify({
          seq: 2,
          type: 'turn.ended',
          payload: { reason: 'completed', usage: minUsage },
        }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const adapter = createAgentChatAdapter({
      endpoint: '/agent/turn',
      surface: 'panel',
      store,
      getExecutionMode: () => 'default' as const,
    })
    const gen = adapter.run({
      messages: [] as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
    })
    for await (const _ of gen as AsyncGenerator<any>) {
      /* drain */
    }

    expect(store.getState().drafts).toHaveLength(1)
    expect(store.getState().drafts[0].action_id).toBe('act-1')
  })

  it('resets store at start of each run', async () => {
    // Put some state in the store first
    store.getState().dispatch({
      seq: 1,
      type: 'phase.started',
      payload: { phase: 2, sub_agents: [{ domain: 'old' }] },
    })

    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({
          seq: 1,
          type: 'turn.ended',
          payload: { reason: 'completed', usage: minUsage },
        }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const adapter = createAgentChatAdapter({
      endpoint: '/agent/turn',
      surface: 'panel',
      store,
      getExecutionMode: () => 'default' as const,
    })
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

  it('propagates errors from onerror to the generator consumer', async () => {
    const networkError = new Error('Network failure')
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onerror?.(networkError)
      // fetchEventSource would reject after onerror throws
      throw networkError
    })

    const adapter = createAgentChatAdapter({
      endpoint: '/agent/turn',
      surface: 'panel',
      store,
      getExecutionMode: () => 'default' as const,
    })
    const gen = adapter.run({
      messages: [] as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
    })

    await expect(async () => {
      for await (const _ of gen as AsyncGenerator<any>) {
        /* drain */
      }
    }).rejects.toThrow('Network failure')
  })

  it('passes abortSignal to fetchEventSource', async () => {
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({
          seq: 1,
          type: 'turn.ended',
          payload: { reason: 'cancelled', usage: minUsage },
        }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const controller = new AbortController()
    const adapter = createAgentChatAdapter({
      endpoint: '/agent/turn',
      surface: 'panel',
      store,
      getExecutionMode: () => 'default' as const,
    })
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

  it('includes execution_mode in POST body', async () => {
    const bodies: string[] = []
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      if (opts?.body) bodies.push(opts.body as string)
      opts?.onmessage?.({
        data: JSON.stringify({
          seq: 1,
          type: 'turn.ended',
          payload: { reason: 'completed', usage: minUsage },
        }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const adapter = createAgentChatAdapter({
      endpoint: '/api/agent/turn',
      surface: 'panel',
      store,
      getExecutionMode: () => 'bypass',
    })

    const gen = adapter.run({ messages: [], abortSignal: new AbortController().signal } as any)
    for await (const _ of gen as AsyncGenerator<any>) {
      /* drain */
    }

    const parsed = JSON.parse(bodies[0] ?? '{}')
    expect(parsed.execution_mode).toBe('bypass')
  })
})
