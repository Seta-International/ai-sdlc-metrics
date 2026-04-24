import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAgentEventConsumer } from './event-consumer'

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

/**
 * Helper: create a mock that fires onmessage after a microtask tick so that
 * `.on()` calls made immediately after createAgentEventConsumer() have time
 * to register handlers before the events arrive.
 */
function mockWithDeferredMessages(messages: string[]) {
  mockFetchEventSource.mockImplementation(async (_url, opts) => {
    // Defer via Promise.resolve so callers can chain .on() first
    await Promise.resolve()
    for (const data of messages) {
      opts?.onmessage?.({ data, event: '', id: '', retry: undefined })
    }
  })
}

describe('createAgentEventConsumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a consumer with on() and close()', () => {
    mockFetchEventSource.mockResolvedValue(undefined)
    const consumer = createAgentEventConsumer('/agent/turn', {}, new AbortController().signal)
    expect(typeof consumer.on).toBe('function')
    expect(typeof consumer.close).toBe('function')
  })

  it('on() returns the consumer for chaining', () => {
    mockFetchEventSource.mockResolvedValue(undefined)
    const consumer = createAgentEventConsumer('/agent/turn', {}, new AbortController().signal)
    const result = consumer.on('answer.token', () => {})
    expect(result).toBe(consumer)
  })

  it('dispatches answer.token events to registered handler', async () => {
    const handler = vi.fn()
    mockWithDeferredMessages([
      JSON.stringify({ seq: 1, type: 'answer.token', payload: { text: 'Hello' } }),
    ])

    const consumer = createAgentEventConsumer('/agent/turn', {}, new AbortController().signal)
    consumer.on('answer.token', handler)

    // Wait for the deferred messages to fire
    await new Promise((r) => setTimeout(r, 0))

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'answer.token', payload: { text: 'Hello' } }),
    )
  })

  it('dispatches turn.ended to registered handler', async () => {
    const handler = vi.fn()
    mockWithDeferredMessages([
      JSON.stringify({
        seq: 2,
        type: 'turn.ended',
        payload: { reason: 'completed', usage: minUsage },
      }),
    ])

    const consumer = createAgentEventConsumer('/agent/turn', {}, new AbortController().signal)
    consumer.on('turn.ended', handler)

    await new Promise((r) => setTimeout(r, 0))

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'turn.ended',
        payload: expect.objectContaining({ reason: 'completed' }),
      }),
    )
  })

  it('does not dispatch events to handlers for other types', async () => {
    const tokenHandler = vi.fn()
    const endedHandler = vi.fn()

    mockWithDeferredMessages([
      JSON.stringify({ seq: 1, type: 'answer.token', payload: { text: 'Hi' } }),
    ])

    const consumer = createAgentEventConsumer('/agent/turn', {}, new AbortController().signal)
    consumer.on('answer.token', tokenHandler)
    consumer.on('turn.ended', endedHandler)

    await new Promise((r) => setTimeout(r, 0))

    expect(tokenHandler).toHaveBeenCalledTimes(1)
    expect(endedHandler).not.toHaveBeenCalled()
  })

  it('calls multiple handlers for the same event type', async () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()

    mockWithDeferredMessages([
      JSON.stringify({ seq: 1, type: 'answer.token', payload: { text: 'X' } }),
    ])

    const consumer = createAgentEventConsumer('/agent/turn', {}, new AbortController().signal)
    consumer.on('answer.token', handler1).on('answer.token', handler2)

    await new Promise((r) => setTimeout(r, 0))

    expect(handler1).toHaveBeenCalledTimes(1)
    expect(handler2).toHaveBeenCalledTimes(1)
  })

  it('silently ignores malformed SSE data', async () => {
    const handler = vi.fn()
    mockWithDeferredMessages([
      'not-valid-json',
      JSON.stringify({ seq: 1, type: 'answer.token', payload: { text: 'ok' } }),
    ])

    const consumer = createAgentEventConsumer('/agent/turn', {}, new AbortController().signal)
    consumer.on('answer.token', handler)

    await new Promise((r) => setTimeout(r, 0))

    // Only the valid event should trigger the handler
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('close() aborts the internal controller', async () => {
    const abortSpy = vi.fn()
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      if (opts?.signal) {
        opts.signal.addEventListener('abort', abortSpy)
      }
      // Keep the "connection" open until aborted
      await new Promise(() => {})
    })

    const consumer = createAgentEventConsumer('/agent/turn', {}, new AbortController().signal)
    consumer.close()

    // Allow microtask to process
    await new Promise((r) => setTimeout(r, 0))

    expect(abortSpy).toHaveBeenCalled()
  })

  it('calls fetchEventSource with correct endpoint and body', () => {
    mockFetchEventSource.mockResolvedValue(undefined)
    const body = { messages: [], surface: 'panel' }
    createAgentEventConsumer('/agent/turn', body, new AbortController().signal)

    expect(mockFetchEventSource).toHaveBeenCalledWith(
      '/agent/turn',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }),
    )
  })
})
