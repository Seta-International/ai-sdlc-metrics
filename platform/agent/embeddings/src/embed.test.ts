import { LlmError } from '@seta/agent-core'
import OpenAI from 'openai'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { makeEmbeddingsClient } from './client'

type CreateArgs = Parameters<OpenAI['embeddings']['create']>[0]
type CreateOpts = Parameters<OpenAI['embeddings']['create']>[1]
type CreateResp = Awaited<ReturnType<OpenAI['embeddings']['create']>>

function makeFakeClient(create: (args: CreateArgs, opts?: CreateOpts) => Promise<CreateResp>) {
  return { embeddings: { create } } as unknown as OpenAI
}

function fakeEmbedding(dim = 4, seed = 0): number[] {
  return Array.from({ length: dim }, (_, i) => seed + i * 0.001)
}

function fakeResponse(inputs: string[], promptTokens = 7, totalTokens = 7): CreateResp {
  return {
    object: 'list',
    data: inputs.map((_, i) => ({
      object: 'embedding',
      index: i,
      embedding: fakeEmbedding(4, i),
    })),
    model: 'text-embedding-3-small',
    usage: { prompt_tokens: promptTokens, total_tokens: totalTokens },
  } as unknown as CreateResp
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('embed — happy paths', () => {
  test('empty input short-circuits without calling the SDK', async () => {
    const create = vi.fn(async () => fakeResponse([]))
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const r = await client.embed([])
    expect(r.embeddings).toEqual([])
    expect(r.usage).toEqual({ promptTokens: 0, totalTokens: 0 })
    expect(create).not.toHaveBeenCalled()
  })

  test('single batch (3 inputs) → one create call, ordered embeddings, usage forwarded', async () => {
    const create = vi.fn(async (args: CreateArgs) => {
      const inputs = args.input as string[]
      return fakeResponse(inputs, 13, 13)
    })
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const r = await client.embed(['a', 'b', 'c'])
    expect(create).toHaveBeenCalledTimes(1)
    expect(r.embeddings).toHaveLength(3)
    expect(r.embeddings[0]).toEqual(fakeEmbedding(4, 0))
    expect(r.embeddings[1]).toEqual(fakeEmbedding(4, 1))
    expect(r.embeddings[2]).toEqual(fakeEmbedding(4, 2))
    expect(r.usage).toEqual({ promptTokens: 13, totalTokens: 13 })
  })

  test('multi-batch (250 inputs) → 3 sequential create calls, usage aggregated', async () => {
    const calls: number[] = []
    const create = vi.fn(async (args: CreateArgs) => {
      const inputs = args.input as string[]
      calls.push(inputs.length)
      return fakeResponse(inputs, 10, 10)
    })
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const inputs = Array.from({ length: 250 }, (_, i) => `text-${i}`)
    const r = await client.embed(inputs)
    expect(create).toHaveBeenCalledTimes(3)
    expect(calls).toEqual([100, 100, 50])
    expect(r.embeddings).toHaveLength(250)
    expect(r.usage).toEqual({ promptTokens: 30, totalTokens: 30 })
  })

  test('passes `signal` from EmbedOptions into client.embeddings.create', async () => {
    const ac = new AbortController()
    const create = vi.fn(async (args: CreateArgs, opts?: CreateOpts) => {
      expect(opts?.signal).toBe(ac.signal)
      return fakeResponse(args.input as string[])
    })
    const client = makeEmbeddingsClient(makeFakeClient(create))
    await client.embed(['x'], { signal: ac.signal })
    expect(create).toHaveBeenCalledTimes(1)
  })
})

describe('embed — validation failures', () => {
  test('blank string throws LlmError(LLM_BAD_REQUEST, USER) without calling SDK', async () => {
    const create = vi.fn(async () => fakeResponse([]))
    const client = makeEmbeddingsClient(makeFakeClient(create))
    await expect(client.embed(['', 'ok'])).rejects.toBeInstanceOf(LlmError)
    expect(create).not.toHaveBeenCalled()
  })

  test('whitespace-only string throws LlmError', async () => {
    const create = vi.fn(async () => fakeResponse([]))
    const client = makeEmbeddingsClient(makeFakeClient(create))
    await expect(client.embed(['   '])).rejects.toBeInstanceOf(LlmError)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('embed — error mapping', () => {
  function apiError(status: number, message: string) {
    return new OpenAI.APIError(
      status,
      { error: { message } },
      message,
      undefined as unknown as Headers,
    )
  }

  test('non-retryable 401 from SDK → LlmError(LLM_AUTH_FAILED), no retry', async () => {
    const create = vi.fn(async () => {
      throw apiError(401, 'unauthorized')
    })
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const pending = client.embed(['x']).catch((e) => e)
    await vi.runAllTimersAsync()
    const got = (await pending) as LlmError
    expect(got).toBeInstanceOf(LlmError)
    expect(got.code).toBe('LLM_AUTH_FAILED')
    expect(create).toHaveBeenCalledTimes(1)
  })

  test('retryable 429 from SDK → withRetry retries up to 2 times then surfaces LlmError(LLM_RATE_LIMITED)', async () => {
    const create = vi.fn(async () => {
      throw apiError(429, 'rate limited')
    })
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const pending = client.embed(['x']).catch((e) => e)
    await vi.runAllTimersAsync()
    const got = (await pending) as LlmError
    expect(got).toBeInstanceOf(LlmError)
    expect(got.code).toBe('LLM_RATE_LIMITED')
    expect(create).toHaveBeenCalledTimes(3)
  })

  test('response-length mismatch throws LlmError(LLM_UNKNOWN, THIRD_PARTY)', async () => {
    const create = vi.fn(async (args: CreateArgs) => {
      const inputs = args.input as string[]
      return fakeResponse(inputs.slice(0, 1))
    })
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const pending = client.embed(['a', 'b']).catch((e) => e)
    await vi.runAllTimersAsync()
    const got = (await pending) as LlmError
    expect(got).toBeInstanceOf(LlmError)
    expect(got.code).toBe('LLM_UNKNOWN')
    expect(got.category).toBe('THIRD_PARTY')
  })
})

describe('embed — abort behaviour', () => {
  test('pre-aborted signal throws DOMException(AbortError) before any SDK call', async () => {
    const ac = new AbortController()
    ac.abort()
    const create = vi.fn(async () => fakeResponse([]))
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const pending = client.embed(['x'], { signal: ac.signal }).catch((e) => e)
    await vi.runAllTimersAsync()
    const got = await pending
    expect(got).not.toBeInstanceOf(LlmError)
    expect((got as { name?: string }).name).toBe('AbortError')
    expect(create).not.toHaveBeenCalled()
  })

  test('AbortError thrown by SDK mid-flight propagates unmapped', async () => {
    const create = vi.fn(async () => {
      const e = new Error('aborted')
      e.name = 'AbortError'
      throw e
    })
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const pending = client.embed(['x']).catch((e) => e)
    await vi.runAllTimersAsync()
    const got = await pending
    expect(got).not.toBeInstanceOf(LlmError)
    expect((got as { name?: string }).name).toBe('AbortError')
    expect(create).toHaveBeenCalledTimes(1)
  })

  test('signal aborted between batches → throws before next batch starts', async () => {
    const ac = new AbortController()
    let callIdx = 0
    const create = vi.fn(async (args: CreateArgs) => {
      callIdx++
      if (callIdx === 1) {
        ac.abort()
        return fakeResponse(args.input as string[])
      }
      return fakeResponse(args.input as string[])
    })
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const inputs = Array.from({ length: 150 }, (_, i) => `t-${i}`)
    const pending = client.embed(inputs, { signal: ac.signal }).catch((e) => e)
    await vi.runAllTimersAsync()
    const got = await pending
    expect(create).toHaveBeenCalledTimes(1)
    expect((got as { name?: string }).name).toBe('AbortError')
  })
})
