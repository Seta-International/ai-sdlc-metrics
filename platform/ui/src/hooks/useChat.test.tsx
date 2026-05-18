import { act, renderHook, waitFor } from '@testing-library/react'
import type { TextUIPart } from 'ai'
import { describe, expect, it, vi } from 'vitest'
import { useChat } from './useChat'

// ---- helpers ----------------------------------------------------------------

function makeStream(body: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(body))
      c.close()
    },
  })
}

function frames(...lines: string[]): string {
  return lines.map((l) => `data: ${l}\n\n`).join('')
}

// ---- tests ------------------------------------------------------------------

describe('useChat', () => {
  it('sendMessage immediately puts a user message in state', () => {
    const streamFn = vi.fn().mockResolvedValue(makeStream(''))
    const { result } = renderHook(() => useChat({ stream: streamFn }))

    act(() => {
      result.current.sendMessage('hello')
    })

    expect(result.current.messages).toHaveLength(1)
    const user = result.current.messages[0]
    expect(user?.role).toBe('user')
    expect((user?.parts[0] as TextUIPart).text).toBe('hello')
  })

  it('sets isRunning=true immediately and false after stream ends', async () => {
    const body = frames(
      '{"type":"text","delta":"hi"}',
      '{"type":"finish","reason":"stop","usage":{"inputTokens":5,"outputTokens":2}}',
    )
    const streamFn = vi.fn().mockResolvedValue(makeStream(body))
    const { result } = renderHook(() => useChat({ stream: streamFn }))

    act(() => {
      result.current.sendMessage('hey')
    })

    expect(result.current.isRunning).toBe(true)

    await waitFor(() => expect(result.current.isRunning).toBe(false))
  })

  it('after streaming text chunks, an assistant message with concatenated text appears', async () => {
    const body = frames(
      '{"type":"text","delta":"Hel"}',
      '{"type":"text","delta":"lo"}',
      '{"type":"finish","reason":"stop"}',
    )
    const streamFn = vi.fn().mockResolvedValue(makeStream(body))
    const { result } = renderHook(() => useChat({ stream: streamFn }))

    act(() => {
      result.current.sendMessage('hi')
    })

    await waitFor(() => expect(result.current.isRunning).toBe(false))

    const msgs = result.current.messages
    expect(msgs).toHaveLength(2)
    const assistant = msgs[1]
    expect(assistant?.role).toBe('assistant')
    const textPart = assistant?.parts.find((p) => p.type === 'text') as TextUIPart | undefined
    expect(textPart?.text).toBe('Hello')
  })

  it('after finish chunk, metadata.status is done and isRunning is false', async () => {
    const body = frames(
      '{"type":"text","delta":"answer"}',
      '{"type":"finish","reason":"stop","usage":{"inputTokens":3,"outputTokens":1}}',
    )
    const streamFn = vi.fn().mockResolvedValue(makeStream(body))
    const { result } = renderHook(() => useChat({ stream: streamFn }))

    act(() => {
      result.current.sendMessage('q')
    })

    await waitFor(() => expect(result.current.isRunning).toBe(false))

    const assistant = result.current.messages[1]
    expect(assistant?.metadata?.status).toBe('done')
    expect(assistant?.metadata?.usage).toEqual({ inputTokens: 3, outputTokens: 1 })
  })

  it('error chunk sets metadata.status=error and isRunning=false', async () => {
    const body = frames(
      '{"type":"text","delta":"partial"}',
      '{"type":"error","error":{"id":"e1","code":"LLM_TIMEOUT","domain":"LLM","category":"THIRD_PARTY","message":"timed out"}}',
    )
    const streamFn = vi.fn().mockResolvedValue(makeStream(body))
    const { result } = renderHook(() => useChat({ stream: streamFn }))

    act(() => {
      result.current.sendMessage('q')
    })

    await waitFor(() => expect(result.current.isRunning).toBe(false))

    const assistant = result.current.messages[1]
    expect(assistant?.metadata?.status).toBe('error')
    expect(assistant?.metadata?.error?.code).toBe('LLM_TIMEOUT')
  })

  it('cancel() while streaming → isRunning=false eventually', async () => {
    // Use a slow stream that never closes so we can cancel mid-flight
    const deferred = { resolve: (_s: ReadableStream<Uint8Array>) => {} }
    const pending = new Promise<ReadableStream<Uint8Array>>((res) => {
      deferred.resolve = res
    })
    const streamFn = vi.fn().mockReturnValue(pending)
    const { result } = renderHook(() => useChat({ stream: streamFn }))

    act(() => {
      result.current.sendMessage('hi')
    })

    expect(result.current.isRunning).toBe(true)

    // Provide a never-ending stream body (just empty bytes that stay open)
    const enc = new TextEncoder()
    const neverClosing = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(''))
        // intentionally never call c.close() — will be aborted
      },
    })
    act(() => {
      deferred.resolve(neverClosing)
    })

    act(() => {
      result.current.cancel()
    })

    await waitFor(() => expect(result.current.isRunning).toBe(false))
  })

  it('abort chunk from stream sets metadata.status=aborted', async () => {
    const body = frames('{"type":"text","delta":"partial"}', '{"type":"abort"}')
    const streamFn = vi.fn().mockResolvedValue(makeStream(body))
    const { result } = renderHook(() => useChat({ stream: streamFn }))

    act(() => {
      result.current.sendMessage('q')
    })

    await waitFor(() => expect(result.current.isRunning).toBe(false))

    const assistant = result.current.messages[1]
    expect(assistant?.metadata?.status).toBe('aborted')
  })

  it('stream function receives the message history before the new user message', async () => {
    const streamFn = vi
      .fn()
      .mockResolvedValue(makeStream(frames('{"type":"finish","reason":"stop"}')))
    const { result } = renderHook(() => useChat({ stream: streamFn }))

    act(() => {
      result.current.sendMessage('first')
    })

    await waitFor(() => expect(result.current.isRunning).toBe(false))

    // First call: messages snapshot was empty
    expect(streamFn.mock.calls[0]?.[0].messages).toHaveLength(0)
    expect(streamFn.mock.calls[0]?.[0].text).toBe('first')
  })

  it('does not start a second stream while one is in progress', async () => {
    const deferred = { resolve: (_s: ReadableStream<Uint8Array>) => {} }
    const pending = new Promise<ReadableStream<Uint8Array>>((res) => {
      deferred.resolve = res
    })
    const streamFn = vi.fn().mockReturnValueOnce(pending)
    const { result } = renderHook(() => useChat({ stream: streamFn }))

    act(() => {
      result.current.sendMessage('one')
    })

    act(() => {
      result.current.sendMessage('two')
    })

    // stream was called only once
    expect(streamFn).toHaveBeenCalledTimes(1)

    // Resolve to avoid hanging
    const enc = new TextEncoder()
    act(() => {
      deferred.resolve(
        new ReadableStream({
          start(c) {
            c.enqueue(enc.encode(''))
            c.close()
          },
        }),
      )
    })
    await waitFor(() => expect(result.current.isRunning).toBe(false))
  })
})

describe('useChat — type guard helpers (regression)', () => {
  it('text chunks are concatenated in the assistant message parts', async () => {
    const body = frames('{"type":"text","delta":"a"}', '{"type":"text","delta":"b"}')
    const streamFn = vi.fn().mockResolvedValue(makeStream(body))
    const { result } = renderHook(() => useChat({ stream: streamFn }))

    act(() => {
      result.current.sendMessage('q')
    })

    await waitFor(() => expect(result.current.isRunning).toBe(false))

    const assistant = result.current.messages.find((m) => m.role === 'assistant')
    expect(assistant).toBeDefined()
    const textPart = assistant?.parts.find((p) => p.type === 'text') as TextUIPart | undefined
    expect(textPart?.text).toBe('ab')
  })
})
