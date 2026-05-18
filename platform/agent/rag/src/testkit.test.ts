// platform/agent/rag/src/testkit.test.ts
import { describe, expect, it } from 'vitest'
import { createFakeAgentRag } from './testkit.js'
import type { RagHit } from './types.js'

const sampleHit = (id: string): RagHit => ({
  chunkId: id,
  sourceId: `src-${id}`,
  content: `content-${id}`,
  rrfScore: 0.1,
  vectorRank: 1,
  vectorSimilarity: 0.9,
  citation: { sourceId: `src-${id}`, span: { startChar: 0, endChar: 10 } },
})

describe('createFakeAgentRag', () => {
  it('retrieve returns canned hits regardless of query when only `hits` is set', async () => {
    const hits = [sampleHit('a'), sampleHit('b')]
    const fake = createFakeAgentRag({ hits })
    const r1 = await fake.retrieve('whatever query')
    const r2 = await fake.retrieve('completely different query')
    expect(r1).toEqual(hits)
    expect(r2).toEqual(hits)
  })

  it('retrieve uses the `retrieve` responder when supplied, ignoring `hits`', async () => {
    const fake = createFakeAgentRag({
      hits: [sampleHit('static')],
      retrieve: (q) => [{ ...sampleHit('dynamic'), content: q }],
    })
    const r = await fake.retrieve('hello')
    expect(r).toHaveLength(1)
    expect(r[0]!.content).toBe('hello')
  })

  it('retrieve responder may return a Promise', async () => {
    const fake = createFakeAgentRag({
      retrieve: async (q) => [{ ...sampleHit('async'), content: q }],
    })
    const r = await fake.retrieve('async-query')
    expect(r).toHaveLength(1)
    expect(r[0]!.content).toBe('async-query')
  })

  it('retrieve returns [] when neither `hits` nor `retrieve` is set', async () => {
    const fake = createFakeAgentRag()
    expect(await fake.retrieve('query')).toEqual([])
  })

  it('ingest is a no-op and records the call on __calls.ingest', async () => {
    const fake = createFakeAgentRag()
    await fake.ingest('s1', 'first content')
    await fake.ingest('s2', 'second content')
    expect(fake.__calls.ingest).toEqual([
      { sourceId: 's1', content: 'first content' },
      { sourceId: 's2', content: 'second content' },
    ])
  })

  it('each createFakeAgentRag instance has its own __calls array', async () => {
    const a = createFakeAgentRag()
    const b = createFakeAgentRag()
    await a.ingest('s1', 'x')
    expect(a.__calls.ingest).toHaveLength(1)
    expect(b.__calls.ingest).toHaveLength(0)
  })
})
