import { tenantContext } from '@seta/tenant'
import { describe, expect, it, vi } from 'vitest'
import { createEtagStore } from './etag'

const makeFakeSql = (rows: unknown[]) =>
  vi.fn().mockResolvedValue(rows) as unknown as Parameters<typeof createEtagStore>[0]

const withTenant = <T>(fn: () => Promise<T>): Promise<T> =>
  tenantContext.run({ tenantId: 'test-tenant-id' }, fn)

describe('etagStore', () => {
  it('returns etag from cache when row exists', async () => {
    const sql = makeFakeSql([{ etag: 'W/"cached"' }])
    const store = createEtagStore(sql)
    const result = await withTenant(() => store.get('T1'))
    expect(result).toBe('W/"cached"')
  })

  it('returns null when no row', async () => {
    const sql = makeFakeSql([])
    const store = createEtagStore(sql)
    const result = await withTenant(() => store.get('T1'))
    expect(result).toBeNull()
  })
})
