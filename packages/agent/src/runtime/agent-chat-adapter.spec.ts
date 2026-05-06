import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAgentChatAdapter, mapEventToPartUpdate } from './agent-chat-adapter'
import { createAgentTurnStore } from './agent-turn-store'
import { PLAN_TOOL, ITERATION_TOOL, DRAFT_TOOL } from './agent-message-parts'

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

  it('propagates errors from onerror to the generator consumer', async () => {
    const networkError = new Error('Network failure')
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onerror?.(networkError)
      // fetchEventSource would reject after onerror throws
      throw networkError
    })

    const adapter = createAgentChatAdapter({ endpoint: '/agent/turn', surface: 'panel', store })
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

describe('mapEventToPartUpdate', () => {
  it('turn.started emits a plan tool-call part', () => {
    const update = mapEventToPartUpdate({
      seq: 1,
      type: 'turn.started',
      payload: { trace_id: 'abc123', conversation_id: null, topology: 'bounded' },
    })
    expect(update).toEqual([
      {
        op: 'upsert',
        partId: 'plan',
        toolName: PLAN_TOOL,
        args: {
          traceId: 'abc123',
          conversationId: null,
          topology: 'bounded',
          phase: null,
          subAgents: [],
        },
      },
    ])
  })

  it('phase.started extends the existing plan part', () => {
    const update = mapEventToPartUpdate({
      seq: 2,
      type: 'phase.started',
      payload: { phase: 1, sub_agents: [{ domain: 'planner' }] },
    })
    expect(update).toEqual([
      { op: 'merge', partId: 'plan', args: { phase: 1, subAgents: [{ domain: 'planner' }] } },
    ])
  })

  it('iteration.started appends an iteration tool-call part with state=running', () => {
    const update = mapEventToPartUpdate({
      seq: 3,
      type: 'iteration.started',
      payload: { n: 1, sub_agent_domain: 'planner', selection_reason: 'first match' },
    })
    expect(update).toEqual([
      {
        op: 'upsert',
        partId: 'iter-1',
        toolName: ITERATION_TOOL,
        args: { n: 1, subAgentDomain: 'planner', selectionReason: 'first match', state: 'running' },
      },
    ])
  })

  it('iteration.validated mutates the matching iteration part', () => {
    const update = mapEventToPartUpdate({
      seq: 4,
      type: 'iteration.validated',
      payload: {
        n: 1,
        passed: true,
        scorer_results: [{ scorer: 'q1', passed: true }],
        max_iterations_reached: false,
      },
    })
    expect(update).toEqual([
      {
        op: 'merge',
        partId: 'iter-1',
        args: { state: 'passed', scorerResults: [{ scorer: 'q1', passed: true }] },
      },
    ])
  })

  it('iteration.validated marks failed when passed=false', () => {
    const update = mapEventToPartUpdate({
      seq: 4,
      type: 'iteration.validated',
      payload: { n: 2, passed: false, scorer_results: [], max_iterations_reached: false },
    })
    expect(update?.[0]?.args).toMatchObject({ state: 'failed' })
  })

  it('iteration.ended writes usage + isComplete', () => {
    const update = mapEventToPartUpdate({
      seq: 5,
      type: 'iteration.ended',
      payload: {
        n: 1,
        is_complete: true,
        usage: {
          input_tokens: 1,
          output_tokens: 2,
          input_cached_read: 0,
          input_cached_write: 0,
          output_reasoning: 0,
        },
      },
    })
    expect(update?.[0]).toMatchObject({ op: 'merge', partId: 'iter-1', args: { isComplete: true } })
  })

  it('answer.token appends to the streaming text part', () => {
    const update = mapEventToPartUpdate({
      seq: 6,
      type: 'answer.token',
      payload: { text: 'Hello ' },
    })
    expect(update).toEqual([{ op: 'append-text', text: 'Hello ' }])
  })

  it('answer.complete replaces text with string content', () => {
    const update = mapEventToPartUpdate({
      seq: 7,
      type: 'answer.complete',
      payload: { shape: 'markdown', content: 'Final answer', citations: [] },
    })
    expect(update).toEqual([{ op: 'replace-text', text: 'Final answer' }])
  })

  it('answer.complete stringifies non-string content', () => {
    const update = mapEventToPartUpdate({
      seq: 8,
      type: 'answer.complete',
      payload: { shape: 'json', content: { key: 'val' }, citations: [] },
    })
    expect(update?.[0]).toMatchObject({ op: 'replace-text' })
    expect((update?.[0] as { text: string }).text).toContain('"key"')
  })

  it('draft.proposed emits a draft tool-call part', () => {
    const update = mapEventToPartUpdate({
      seq: 7,
      type: 'draft.proposed',
      payload: {
        action_id: 'a1',
        summary: 'Approve leave',
        tier: 'high',
        requires_approval: true,
        provenance: { sub_agent_domain: 'people', trace_id: 't1' },
      },
    })
    expect(update).toEqual([
      {
        op: 'upsert',
        partId: 'draft-a1',
        toolName: DRAFT_TOOL,
        args: {
          actionId: 'a1',
          summary: 'Approve leave',
          tier: 'high',
          requiresApproval: true,
          provenance: { sub_agent_domain: 'people', trace_id: 't1' },
        },
      },
    ])
  })

  it('refusal.started emits a refusal text replacement', () => {
    const update = mapEventToPartUpdate({
      seq: 8,
      type: 'refusal.started',
      payload: { reason: 'rate_limit', retry_allowed: false },
    })
    expect(update).toEqual([{ op: 'replace-text', text: '⚠ Refused: rate_limit' }])
  })

  it('turn.ended returns a finalize signal', () => {
    const update = mapEventToPartUpdate({
      seq: 9,
      type: 'turn.ended',
      payload: {
        reason: 'completed',
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          input_cached_read: 0,
          input_cached_write: 0,
          output_reasoning: 0,
        },
      },
    })
    expect(update).toEqual([{ op: 'finalize', endReason: 'completed' }])
  })

  it('progress and answer.shape_declared return null', () => {
    expect(
      mapEventToPartUpdate({ seq: 10, type: 'progress', payload: { message: 'still here' } }),
    ).toBeNull()
    expect(
      mapEventToPartUpdate({
        seq: 11,
        type: 'answer.shape_declared',
        payload: { shape: 'markdown' },
      }),
    ).toBeNull()
  })
})
