import { describe, expect, it } from 'vitest'
import type { MemoryContext } from '../types'
import { NullMemoryProvider } from './null-provider'

const ctx: MemoryContext = { threadId: 't1', scope: 'thread' }

describe('NullMemoryProvider', () => {
  const m = new NullMemoryProvider()

  it('recall returns empty paginated result', async () => {
    const r = await m.recall(ctx)
    expect(r).toEqual({ messages: [], total: 0, page: 1, perPage: 0, hasMore: false })
  })

  it('saveTurn is a no-op', async () => {
    await expect(m.saveTurn(ctx, [])).resolves.toBeUndefined()
  })

  it('getWorkingMemory returns null', async () => {
    await expect(m.getWorkingMemory(ctx)).resolves.toBeNull()
  })

  it('updateWorkingMemory is a no-op', async () => {
    await expect(m.updateWorkingMemory(ctx, 'anything')).resolves.toBeUndefined()
  })
})
