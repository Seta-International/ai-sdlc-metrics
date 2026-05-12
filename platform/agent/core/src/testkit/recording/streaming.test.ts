import { describe, expect, it } from 'vitest'
import { captureStreamingResponse, createStreamingResponse, isStreamingResponse } from './streaming'
import type { LLMRecording } from './types'

function makeSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'text/event-stream' },
  })
}

describe('isStreamingResponse', () => {
  it('detects text/event-stream', () => {
    expect(isStreamingResponse(new Headers({ 'content-type': 'text/event-stream' }))).toBe(true)
  })
  it('detects text/plain (some providers use it for SSE)', () => {
    expect(isStreamingResponse(new Headers({ 'content-type': 'text/plain' }))).toBe(true)
  })
  it('returns false for application/json', () => {
    expect(isStreamingResponse(new Headers({ 'content-type': 'application/json' }))).toBe(false)
  })
  it('returns false when content-type is absent', () => {
    expect(isStreamingResponse(new Headers())).toBe(false)
  })
})

describe('captureStreamingResponse', () => {
  it('captures each reader.read() decode as a string entry', async () => {
    const res = makeSseResponse(['event: a\ndata: 1\n\n', 'event: b\ndata: 2\n\n'])
    const { chunks, timings } = await captureStreamingResponse(res)
    expect(chunks).toEqual(['event: a\ndata: 1\n\n', 'event: b\ndata: 2\n\n'])
    expect(timings).toHaveLength(2)
    expect(timings.every((t) => t >= 0)).toBe(true)
  })

  it('returns an empty result when the body is null', async () => {
    const res = new Response(null, { status: 204 })
    const { chunks, timings } = await captureStreamingResponse(res)
    expect(chunks).toEqual([])
    expect(timings).toEqual([])
  })
})

describe('createStreamingResponse', () => {
  it('rebuilds a ReadableStream that emits the recorded chunks in order', async () => {
    const recording: LLMRecording = {
      hash: 'h',
      request: { url: 'https://x/y', method: 'POST', body: {} },
      response: {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
        chunks: ['event: a\ndata: 1\n\n', 'event: b\ndata: 2\n\n'],
        chunkTimings: [0, 5],
        isStreaming: true,
      },
    }
    const res = createStreamingResponse(recording)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/event-stream')

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    const out: string[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      out.push(decoder.decode(value))
    }
    expect(out).toEqual(['event: a\ndata: 1\n\n', 'event: b\ndata: 2\n\n'])
  })

  it('replays with no inter-chunk delay (entire stream resolves in < 50ms for 100 chunks)', async () => {
    const chunks = Array.from({ length: 100 }, (_, i) => `data: ${i}\n\n`)
    const timings = Array.from({ length: 100 }, () => 50) // would be 5s if we slept
    const recording: LLMRecording = {
      hash: 'h',
      request: { url: 'https://x/y', method: 'POST', body: {} },
      response: {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
        chunks,
        chunkTimings: timings,
        isStreaming: true,
      },
    }
    const start = Date.now()
    const reader = createStreamingResponse(recording).body!.getReader()
    while (true) {
      const { done } = await reader.read()
      if (done) break
    }
    expect(Date.now() - start).toBeLessThan(50)
  })

  it('aborts when the consumer cancels the reader', async () => {
    const recording: LLMRecording = {
      hash: 'h',
      request: { url: 'https://x/y', method: 'POST', body: {} },
      response: {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
        chunks: ['a', 'b', 'c'],
        chunkTimings: [0, 0, 0],
        isStreaming: true,
      },
    }
    const reader = createStreamingResponse(recording).body!.getReader()
    const first = await reader.read()
    expect(first.done).toBe(false)
    await reader.cancel()
    const next = await reader.read()
    expect(next.done).toBe(true)
  })
})
