import { getTableColumns } from 'drizzle-orm'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { agentVectorSchema, type Chunk, chunks, type NewChunk } from './schema'

describe('agent_vector schema', () => {
  test('exports the agent_vector pgSchema with the right name', () => {
    expect(agentVectorSchema.schemaName).toBe('agent_vector')
  })

  test('exports the chunks table with the documented column set', () => {
    const cols = Object.keys(getTableColumns(chunks))
    expect(cols.sort()).toEqual(
      [
        'content',
        'contentHash',
        'createdAt',
        'embedding',
        'id',
        'sourceId',
        'tenantId',
        'tokenCount',
      ].sort(),
    )
  })

  test('NewChunk insert type accepts a full row shape', () => {
    const row: NewChunk = {
      tenantId: '00000000-0000-0000-0000-000000000001',
      sourceId: '00000000-0000-0000-0000-000000000002',
      content: 'hello',
      contentHash: 'a'.repeat(64),
      tokenCount: 1,
      embedding: [0.1, 0.2, 0.3],
    }
    expectTypeOf(row).toEqualTypeOf<NewChunk>()
  })

  test('Chunk select type has all columns including DB-generated ones', () => {
    expectTypeOf<Chunk>().toHaveProperty('id').toBeString()
    expectTypeOf<Chunk>().toHaveProperty('createdAt').toEqualTypeOf<Date>()
  })
})
