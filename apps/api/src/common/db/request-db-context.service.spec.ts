import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClsService } from 'nestjs-cls'
import type { Db } from '@future/db'
import { RequestDbContextService } from './request-db-context.service'

describe('RequestDbContextService', () => {
  let cls: Pick<ClsService, 'get' | 'set'>
  let service: RequestDbContextService

  beforeEach(() => {
    cls = { get: vi.fn(), set: vi.fn() }
    service = new RequestDbContextService(cls as ClsService)
  })

  describe('getDb', () => {
    it('returns the db when set', () => {
      const db = {} as Db
      vi.mocked(cls.get).mockReturnValue(db)
      expect(service.getDb()).toBe(db)
    })

    it('returns null when not set', () => {
      vi.mocked(cls.get).mockReturnValue(undefined)
      expect(service.getDb()).toBeNull()
    })
  })

  describe('setDb', () => {
    it('stores the db in CLS', () => {
      const db = {} as Db
      service.setDb(db)
      expect(cls.set).toHaveBeenCalledWith('requestDb', db)
    })
  })

  describe('clearDb', () => {
    it('sets db to null in CLS', () => {
      service.clearDb()
      expect(cls.set).toHaveBeenCalledWith('requestDb', null)
    })
  })
})
