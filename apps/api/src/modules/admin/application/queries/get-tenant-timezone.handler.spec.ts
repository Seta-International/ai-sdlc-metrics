import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@future/db'
import { GetTenantTimezoneQuery } from './get-tenant-timezone.query'
import { GetTenantTimezoneHandler } from './get-tenant-timezone.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

function makeDb(rows: Array<{ timezone: string }>): Db {
  const selectFn = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  })
  return { select: selectFn } as unknown as Db
}

describe('GetTenantTimezoneHandler', () => {
  let handler: GetTenantTimezoneHandler

  describe('when tenant_settings row has a stored timezone', () => {
    beforeEach(() => {
      handler = new GetTenantTimezoneHandler(makeDb([{ timezone: 'America/New_York' }]))
    })

    it('returns the stored timezone', async () => {
      const result = await handler.execute(new GetTenantTimezoneQuery(TENANT_ID))
      expect(result).toBe('America/New_York')
    })
  })

  describe('when no tenant_settings row exists', () => {
    beforeEach(() => {
      handler = new GetTenantTimezoneHandler(makeDb([]))
    })

    it('defaults to Asia/Ho_Chi_Minh', async () => {
      const result = await handler.execute(new GetTenantTimezoneQuery(TENANT_ID))
      expect(result).toBe('Asia/Ho_Chi_Minh')
    })
  })
})
