import type { EmbeddingsClient } from '@seta/agent-embeddings'
import type { DbSql } from '@seta/db'
import { describe, expect, it } from 'vitest'
import { createAgentRag } from './factory.js'

const dummySql = {} as DbSql
const dummyEmbeddings: EmbeddingsClient = {
  embed: async () => ({ embeddings: [], usage: { promptTokens: 0, totalTokens: 0 } }),
}

describe('createAgentRag', () => {
  it('returns an object with ingest and retrieve methods', () => {
    const rag = createAgentRag({ sql: dummySql, embeddings: dummyEmbeddings })
    expect(typeof rag.ingest).toBe('function')
    expect(typeof rag.retrieve).toBe('function')
  })
})
