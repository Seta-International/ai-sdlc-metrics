/**
 * null-semantic-index.repository.spec.ts
 *
 * Unit tests for NullSemanticIndexRepository (R-04.36..R-04.40, activation-gate default-off).
 *
 * The stub ships as the default wiring at MVP. Sub-agents opt-in per toolScope;
 * day-1 modules default to off, so no real embedding calls are made in Phase 1.
 */

import { describe, it, expect } from 'vitest'
import { NullSemanticIndexRepository } from './null-semantic-index.repository'

describe('NullSemanticIndexRepository', () => {
  const repo = new NullSemanticIndexRepository()

  it('index() resolves without error', async () => {
    await expect(
      repo.index({
        tenantId: 'tenant-1',
        sourceId: 'source-1',
        sourceType: 'agent_message',
        text: 'hello world',
      }),
    ).resolves.toBeUndefined()
  })

  it('search() returns an empty array', async () => {
    const results = await repo.search({ tenantId: 'tenant-1', query: 'tasks', topK: 5 })
    expect(results).toEqual([])
  })

  it('purgeForUser() returns count 0', async () => {
    const result = await repo.purgeForUser({ tenantId: 'tenant-1', userId: 'user-1' })
    expect(result).toEqual({ count: 0 })
  })
})
