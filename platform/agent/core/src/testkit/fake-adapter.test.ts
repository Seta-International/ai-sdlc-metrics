import { describe, expect, it } from 'vitest'
import type { AdapterRequest, KernelChunk, RunCtx } from '../types'
import { FakeAdapter } from './fake-adapter'

function reqAndCtx(): { req: AdapterRequest; ctx: RunCtx } {
  const ctrl = new AbortController()
  return {
    req: { model: 'fake-model', messages: [] },
    ctx: {
      runId: 'r1',
      signal: ctrl.signal,
      retryCount: 0,
      now: () => 0,
      generateId: () => 'id',
      currentDate: () => new Date(0),
    },
  }
}

describe('FakeAdapter', () => {
  it('emits scripted chunks in order', async () => {
    const a = new FakeAdapter([
      {
        chunks: [
          { type: 'text', delta: 'hello ' },
          { type: 'text', delta: 'world' },
          { type: 'finish', reason: 'stop' },
        ],
      },
    ])
    const { req, ctx } = reqAndCtx()
    const stream = await a.stream(req, ctx)
    const got: KernelChunk[] = []
    for await (const c of stream) got.push(c)
    expect(got).toHaveLength(3)
    expect(got[0]).toEqual({ type: 'text', delta: 'hello ' })
  })

  it('finalMessage reconstructs from text chunks by default', async () => {
    const a = new FakeAdapter([
      {
        chunks: [
          { type: 'text', delta: 'hi ' },
          { type: 'text', delta: 'there' },
          { type: 'finish', reason: 'stop' },
        ],
      },
    ])
    const { req, ctx } = reqAndCtx()
    const stream = await a.stream(req, ctx)
    for await (const _c of stream) {
      void _c
    }
    const final = await stream.finalMessage()
    expect(final.role).toBe('assistant')
    expect(final.content).toEqual([{ type: 'text', text: 'hi there' }])
  })

  it('finalMessage prefers explicit script.finalMessage when provided', async () => {
    const explicit = {
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: 'override' }],
    }
    const a = new FakeAdapter([
      {
        chunks: [{ type: 'finish', reason: 'stop' }],
        finalMessage: explicit,
      },
    ])
    const { req, ctx } = reqAndCtx()
    const stream = await a.stream(req, ctx)
    for await (const _c of stream) {
      void _c
    }
    expect(await stream.finalMessage()).toBe(explicit)
  })

  it('honors abort signal between chunks', async () => {
    const ctrl = new AbortController()
    const a = new FakeAdapter([
      {
        chunks: [
          { type: 'text', delta: '1' },
          { type: 'text', delta: '2' },
          { type: 'text', delta: '3' },
        ],
      },
    ])
    const ctx: RunCtx = {
      runId: 'r1',
      signal: ctrl.signal,
      retryCount: 0,
      now: () => 0,
      generateId: () => 'id',
      currentDate: () => new Date(0),
    }
    const stream = await a.stream({ model: 'fake', messages: [] }, ctx)
    const got: KernelChunk[] = []
    let i = 0
    try {
      for await (const c of stream) {
        got.push(c)
        if (++i === 1) ctrl.abort()
      }
      throw new Error('expected abort to throw')
    } catch (e) {
      expect((e as Error).name).toBe('AbortError')
    }
    expect(got).toHaveLength(1)
  })

  it('abort() method aborts the in-flight stream', async () => {
    const a = new FakeAdapter([
      {
        chunks: [
          { type: 'text', delta: '1' },
          { type: 'text', delta: '2' },
        ],
        delayMs: 100,
      },
    ])
    const { req, ctx } = reqAndCtx()
    const stream = await a.stream(req, ctx)
    setTimeout(() => stream.abort(), 10)
    const got: KernelChunk[] = []
    try {
      for await (const c of stream) got.push(c)
    } catch (e) {
      expect((e as Error).name).toBe('AbortError')
    }
    expect(got.length).toBeLessThan(2)
  })

  it('throwOn injects an error after N chunks', async () => {
    const a = new FakeAdapter([
      {
        chunks: [
          { type: 'text', delta: 'a' },
          { type: 'text', delta: 'b' },
        ],
        throwOn: { afterChunks: 1, error: new Error('boom') },
      },
    ])
    const { req, ctx } = reqAndCtx()
    const stream = await a.stream(req, ctx)
    const got: KernelChunk[] = []
    try {
      for await (const c of stream) got.push(c)
      throw new Error('expected throw')
    } catch (e) {
      expect((e as Error).message).toBe('boom')
    }
    expect(got).toHaveLength(1)
  })

  it('provider id is fake', () => {
    const a = new FakeAdapter([{ chunks: [] }])
    expect(a.provider).toBe('fake')
  })

  it('returns script N on the Nth stream() call', async () => {
    const a = new FakeAdapter([
      {
        chunks: [
          { type: 'text', delta: 'a' },
          { type: 'finish', reason: 'tool_calls' },
        ],
      },
      {
        chunks: [
          { type: 'text', delta: 'b' },
          { type: 'finish', reason: 'stop' },
        ],
      },
    ])
    const { req, ctx } = reqAndCtx()
    const s1: KernelChunk[] = []
    for await (const c of await a.stream(req, ctx)) s1.push(c)
    const s2: KernelChunk[] = []
    for await (const c of await a.stream(req, ctx)) s2.push(c)
    expect(s1[0]).toEqual({ type: 'text', delta: 'a' })
    expect(s2[0]).toEqual({ type: 'text', delta: 'b' })
  })

  it('throws when invoked more times than scripted', async () => {
    const a = new FakeAdapter([{ chunks: [{ type: 'finish', reason: 'stop' }] }])
    const { req, ctx } = reqAndCtx()
    await a.stream(req, ctx)
    await expect(a.stream(req, ctx)).rejects.toThrow(/script exhausted/)
  })

  it('throws when constructed with empty script array', () => {
    expect(() => new FakeAdapter([])).toThrow(/at least one script/)
  })
})
