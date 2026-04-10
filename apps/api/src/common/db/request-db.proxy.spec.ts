import { describe, expect, it, vi } from 'vitest'
import type { Db } from '@future/db'
import { createRequestBoundDbProxy } from './request-db.proxy'

describe('createRequestBoundDbProxy', () => {
  it('routes calls to the request db when one is available', async () => {
    const baseDb = {
      execute: vi.fn(),
    } as unknown as Db
    const requestDb = {
      execute: vi.fn().mockResolvedValue('request-result'),
    } as unknown as Db

    const db = createRequestBoundDbProxy(baseDb, () => requestDb)

    const result = await db.execute('SELECT 1' as never)

    expect(result).toBe('request-result')
    expect(requestDb.execute).toHaveBeenCalledWith('SELECT 1')
    expect(baseDb.execute).not.toHaveBeenCalled()
  })

  it('falls back to the base db when no request db is set', async () => {
    const baseDb = {
      execute: vi.fn().mockResolvedValue('base-result'),
    } as unknown as Db

    const db = createRequestBoundDbProxy(baseDb, () => null)

    const result = await db.execute('SELECT 1' as never)

    expect(result).toBe('base-result')
    expect(baseDb.execute).toHaveBeenCalledWith('SELECT 1')
  })
})
