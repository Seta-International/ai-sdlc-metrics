import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupLLMRecording } from '@seta/agent-core/testkit'
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
})
