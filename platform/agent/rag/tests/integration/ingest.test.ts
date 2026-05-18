import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import { withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenancy'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAgentRag } from '../../src/factory.js'
import { buildEmbeddings, ensureMigrations, testSql, truncateVectorTables } from './_helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RECORDINGS_DIR = path.resolve(__dirname, '__recordings__')

let recording = setupLLMRecording({
  name: 'unused',
  recordingsDir: RECORDINGS_DIR,
})

function hasRecording(name: string): boolean {
  return existsSync(path.join(RECORDINGS_DIR, `${name}.json`))
}

function shouldRun(name: string): boolean {
  return process.env.RECORD !== undefined || hasRecording(name)
}

describe('@seta/agent-rag — ingest (integration)', () => {
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

  it('case 7: empty content short-circuits without any HTTP or insert', async () => {
    recording = setupLLMRecording({
      name: 'ingest-empty-MUST-NOT-RECORD',
      recordingsDir: RECORDINGS_DIR,
    })
    recording.start()
    const tenantId = randomUUID()
    const sourceId = randomUUID()
    const rag = createAgentRag({ sql: testSql(), embeddings: buildEmbeddings() })
    await tenantContext.run({ tenantId }, async () => {
      await rag.ingest(sourceId, '')
    })
    expect(hasRecording('ingest-empty-MUST-NOT-RECORD')).toBe(false)
    const rows = await withTenant(testSql(), tenantId, async (tx) => {
      return tx<unknown[]>`SELECT id FROM agent_vector.chunks`
    })
    expect(rows).toHaveLength(0)
  })

  it('case 5: AbortSignal triggered before embed throws AbortError, inserts nothing', async () => {
    recording = setupLLMRecording({
      name: 'ingest-abort-MUST-NOT-RECORD',
      recordingsDir: RECORDINGS_DIR,
    })
    recording.start()
    const tenantId = randomUUID()
    const sourceId = randomUUID()
    const rag = createAgentRag({ sql: testSql(), embeddings: buildEmbeddings() })
    const ac = new AbortController()
    ac.abort()
    await tenantContext.run({ tenantId }, async () => {
      let caught: unknown
      try {
        await rag.ingest(sourceId, 'one two three four five', { signal: ac.signal })
      } catch (e) {
        caught = e
      }
      expect(caught).toBeDefined()
      const e = caught as Error
      expect(e.name === 'AbortError' || /abort/i.test(e.message)).toBe(true)
    })
    const rows = await withTenant(testSql(), tenantId, async (tx) => {
      return tx<unknown[]>`SELECT id FROM agent_vector.chunks`
    })
    expect(rows).toHaveLength(0)
    expect(hasRecording('ingest-abort-MUST-NOT-RECORD')).toBe(false)
  })

  it('case 6: vector-query error (closed pool) propagates VectorQueryFailedError', async () => {
    const { createPool } = await import('@seta/db')
    const closedSql = createPool('postgres://seta:dev@localhost:5432/seta')
    await closedSql.end()

    const tenantId = randomUUID()
    const sourceId = randomUUID()
    const rag = createAgentRag({ sql: closedSql, embeddings: buildEmbeddings() })
    await tenantContext.run({ tenantId }, async () => {
      let caught: unknown
      try {
        await rag.ingest(sourceId, 'three small words')
      } catch (e) {
        caught = e
      }
      expect(caught).toBeDefined()
      expect((caught as { code?: string }).code).toBe('VECTOR_QUERY_FAILED')
    })
  })

  it.skipIf(!shouldRun('ingest-fresh-3-chunks'))(
    'case 1: fresh ingest produces N chunks, one embed call, N rows with non-null span',
    async () => {
      recording = setupLLMRecording({
        name: 'ingest-fresh-3-chunks',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      const tenantId = randomUUID()
      const sourceId = randomUUID()
      const rag = createAgentRag({ sql: testSql(), embeddings: buildEmbeddings() })
      const content = Array.from(
        { length: 80 },
        (_, i) => `Paragraph ${i}: lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
      ).join('\n\n')
      await tenantContext.run({ tenantId }, async () => {
        await rag.ingest(sourceId, content)
      })
      const rows = await withTenant(testSql(), tenantId, async (tx) => {
        return tx<
          {
            content_hash: string
            span: { startChar: number; endChar: number } | null
          }[]
        >`
          SELECT content_hash, span
          FROM agent_vector.chunks
          WHERE source_id = ${sourceId}
        `
      })
      expect(rows.length).toBeGreaterThanOrEqual(1)
      for (const r of rows) {
        expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/)
        expect(r.span).not.toBeNull()
        expect(r.span!.endChar).toBeGreaterThan(r.span!.startChar)
      }
    },
  )
})
