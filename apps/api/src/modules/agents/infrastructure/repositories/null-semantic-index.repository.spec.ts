/**
 * null-semantic-index.repository.spec.ts
 *
 * Unit tests for NullSemanticIndexRepository.
 *
 * The Null implementation is kept for test mocking. Production wiring uses
 * DrizzleSemanticIndexRepository. This spec verifies the no-op contract.
 */

import { describe, it, expect } from 'vitest'
import { NullSemanticIndexRepository } from './null-semantic-index.repository'

describe('NullSemanticIndexRepository', () => {
  const repo = new NullSemanticIndexRepository()

  it('index() resolves without error', async () => {
    await expect(
      repo.index({
        tenantId: 'tenant-1',
        userId: 'user-1',
        sourceId: 'source-1',
        sourceType: 'agent_message',
        text: 'hello world',
        embedding: [1.0, 0.0, 0.0],
        embeddingModel: 'text-embedding-3-small',
      }),
    ).resolves.toBeUndefined()
  })

  it('search() returns an empty array', async () => {
    const results = await repo.search({
      tenantId: 'tenant-1',
      userId: 'user-1',
      queryEmbedding: [1.0, 0.0, 0.0],
      embeddingModel: 'text-embedding-3-small',
      topK: 5,
    })
    expect(results).toEqual([])
  })

  it('purgeForUser() returns count 0', async () => {
    const result = await repo.purgeForUser({ tenantId: 'tenant-1', userId: 'user-1' })
    expect(result).toEqual({ count: 0 })
  })
})
