import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import { insertChunks } from '@seta/agent-vector'
import { tenantContext } from '@seta/tenancy'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAgentRag } from '../../src/factory.js'
import {
  buildEmbeddings,
  ensureMigrations,
  tenantUserSql,
  testSql,
  truncateVectorTables,
} from './_helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RECORDINGS_DIR = path.resolve(__dirname, '__recordings__')

let recording = setupLLMRecording({
  name: 'unused',
  recordingsDir: RECORDINGS_DIR,
})

function hasRecording(name: string): boolean {
  return existsSync(path.join(RECORDINGS_DIR, `${name}.json`))
}

function sha256hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

/**
 * Deterministic 1536-d unit vector derived from a text seed.
 * Used to seed chunks without paying an OpenAI call.
 */
function seedEmbedding(seed: string): number[] {
  const dims = 1536
  const out = new Array<number>(dims)
  const digest = createHash('sha256').update(seed).digest()
  let state = digest.readUInt32BE(0) || 1
  for (let i = 0; i < dims; i++) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state = state >>> 0
    out[i] = (state / 0xffffffff) * 2 - 1
  }
  let mag = 0
  for (const v of out) mag += v * v
  mag = Math.sqrt(mag) || 1
  for (let i = 0; i < dims; i++) out[i] = out[i]! / mag
  return out
}

describe('@seta/agent-rag — retrieve (integration)', () => {
  beforeAll(async () => {
    await ensureMigrations()
  })

  beforeEach(async () => {
    await truncateVectorTables()
  })

  afterEach(() => {
    recording.stop()
  })

  afterAll(async () => {
    // Pool cleanup happens on process exit; no explicit close.
  })

  it('case 12: AbortSignal pre-cancelled throws AbortError, logs retrieve:aborted', async () => {
    recording = setupLLMRecording({
      name: 'retrieve-abort-MUST-NOT-RECORD',
      recordingsDir: RECORDINGS_DIR,
    })
    recording.start()
    const tenantId = randomUUID()
    const rag = createAgentRag({ sql: testSql(), embeddings: buildEmbeddings() })
    const ac = new AbortController()
    ac.abort()
    await tenantContext.run({ tenantId }, async () => {
      let caught: unknown
      try {
        await rag.retrieve('any query', { signal: ac.signal })
      } catch (e) {
        caught = e
      }
      expect(caught).toBeDefined()
      const e = caught as Error
      expect(e.name === 'AbortError' || /abort/i.test(e.message)).toBe(true)
    })
    expect(hasRecording('retrieve-abort-MUST-NOT-RECORD')).toBe(false)
  })

  it('case 13: corpus with only low-similarity hits returns [] under default minSim', async () => {
    const tenantId = randomUUID()
    const sourceId = randomUUID()
    await tenantContext.run({ tenantId }, async () => {
      await insertChunks(testSql(), [
        {
          tenantId,
          sourceId,
          content: 'apples and oranges',
          contentHash: sha256hex('apples and oranges'),
          tokenCount: 3,
          span: { startChar: 0, endChar: 18 },
          embedding: seedEmbedding('apples and oranges'),
        },
        {
          tenantId,
          sourceId,
          content: 'bananas and grapes',
          contentHash: sha256hex('bananas and grapes'),
          tokenCount: 3,
          span: { startChar: 0, endChar: 18 },
          embedding: seedEmbedding('bananas and grapes'),
        },
      ])
    })

    const rag = createAgentRag({
      sql: testSql(),
      embeddings: {
        async embed(_texts) {
          return {
            embeddings: [seedEmbedding('orthogonal-distant-string-xyz')],
            usage: { promptTokens: 1, totalTokens: 1 },
          }
        },
      },
    })

    const hits = await tenantContext.run({ tenantId }, async () =>
      rag.retrieve('something unrelated'),
    )
    expect(hits).toEqual([])
  })

  it('case 9: retrieve under tenant B returns [] for chunks inserted under tenant A (RLS)', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const sourceId = randomUUID()

    await tenantContext.run({ tenantId: tenantA }, async () => {
      await insertChunks(tenantUserSql(), [
        {
          tenantId: tenantA,
          sourceId,
          content: 'tenant A secret content',
          contentHash: sha256hex('tenant A secret content'),
          tokenCount: 4,
          span: { startChar: 0, endChar: 23 },
          embedding: seedEmbedding('tenant A secret content'),
        },
      ])
    })

    const rag = createAgentRag({
      sql: tenantUserSql(),
      embeddings: {
        async embed() {
          return {
            embeddings: [seedEmbedding('tenant A secret content')],
            usage: { promptTokens: 1, totalTokens: 1 },
          }
        },
      },
    })

    const hitsA = await tenantContext.run({ tenantId: tenantA }, async () =>
      rag.retrieve('whatever'),
    )
    expect(hitsA.length).toBeGreaterThanOrEqual(1)
    expect(hitsA[0]!.content).toBe('tenant A secret content')

    const hitsB = await tenantContext.run({ tenantId: tenantB }, async () =>
      rag.retrieve('whatever'),
    )
    expect(hitsB).toEqual([])
  })
})
