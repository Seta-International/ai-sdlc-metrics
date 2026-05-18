import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { KernelChunk } from '../schemas/chunk'
import { parseSseStream } from './parseSseStream'

const fx = (name: string) => readFileSync(resolve(__dirname, '__fixtures__', name))

function streamFrom(bytes: Uint8Array, chunkSize = 16): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= bytes.length) return controller.close()
      const end = Math.min(i + chunkSize, bytes.length)
      controller.enqueue(bytes.slice(i, end))
      i = end
    },
  })
}

describe('parseSseStream', () => {
  it('parses a complete success run', async () => {
    const received: KernelChunk[] = []
    await parseSseStream(streamFrom(fx('run-success.sse')), (c) => received.push(c))
    expect(received.map((c) => c.type)).toEqual(['text', 'text', 'tool_call', 'finish'])
  })

  it('handles arbitrary chunk boundaries (1-byte chunks)', async () => {
    const received: KernelChunk[] = []
    await parseSseStream(streamFrom(fx('run-success.sse'), 1), (c) => received.push(c))
    expect(received).toHaveLength(4)
  })

  it('propagates an error chunk', async () => {
    const received: KernelChunk[] = []
    await parseSseStream(streamFrom(fx('run-error.sse')), (c) => received.push(c))
    expect(received.at(-1)?.type).toBe('error')
  })

  it('rejects malformed frames', async () => {
    await expect(
      parseSseStream(streamFrom(fx('partial-frame.sse')), () => {}),
    ).rejects.toThrowError(/sse parse/i)
  })

  it('aborts via signal', async () => {
    const ctrl = new AbortController()
    const slow = streamFrom(fx('run-success.sse'), 1)
    const p = parseSseStream(slow, () => {}, { signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toThrow(/abort/i)
  })

  it('ignores comment lines, event lines, and empty data frames', async () => {
    const text =
      ': keep-alive\n\n' +
      'event: ping\ndata: \n\n' +
      'event: finish\ndata: {"type":"finish","reason":"stop"}\n\n'
    const received: KernelChunk[] = []
    await parseSseStream(streamFrom(new TextEncoder().encode(text)), (c) => received.push(c))
    expect(received).toEqual([{ type: 'finish', reason: 'stop' }])
  })

  it('joins multi-line data per SSE spec', async () => {
    const text =
      'event: tool_call\ndata: {"type":"tool_call","toolCallId":"c1",\ndata: "name":"t","args":{}}\n\n'
    const received: KernelChunk[] = []
    await parseSseStream(streamFrom(new TextEncoder().encode(text)), (c) => received.push(c))
    expect(received[0]).toMatchObject({ type: 'tool_call', toolCallId: 'c1', name: 't' })
  })

  it('releases the reader lock when the consumer throws', async () => {
    const stream = streamFrom(fx('run-success.sse'))
    await expect(
      parseSseStream(stream, () => {
        throw new Error('consumer boom')
      }),
    ).rejects.toThrow('consumer boom')

    await expect(stream.cancel()).resolves.toBeUndefined()
  })
})
