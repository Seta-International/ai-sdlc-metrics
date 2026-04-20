import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import type { Db } from '@future/db'
import { UpdateTenantTimezoneCommand } from './update-tenant-timezone.command'
import { UpdateTenantTimezoneHandler } from './update-tenant-timezone.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

interface MockDb {
  insert: ReturnType<typeof vi.fn>
  onConflictDoUpdate: ReturnType<typeof vi.fn>
  values: ReturnType<typeof vi.fn>
}

function makeDb(): { db: Db; mock: MockDb } {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
  const insert = vi.fn().mockReturnValue({ values })
  const db = { insert } as unknown as Db
  return { db, mock: { insert, values, onConflictDoUpdate } }
}

describe('UpdateTenantTimezoneHandler', () => {
  let handler: UpdateTenantTimezoneHandler
  let mock: MockDb

  beforeEach(() => {
    const made = makeDb()
    mock = made.mock
    handler = new UpdateTenantTimezoneHandler(made.db)
  })

  describe('when timezone is a valid IANA zone', () => {
    it('upserts tenant_settings with the new timezone', async () => {
      await handler.execute(new UpdateTenantTimezoneCommand(TENANT_ID, 'America/New_York'))
      expect(mock.insert).toHaveBeenCalledTimes(1)
      expect(mock.values).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID, timezone: 'America/New_York' }),
      )
      expect(mock.onConflictDoUpdate).toHaveBeenCalledTimes(1)
      const onConflictArg = mock.onConflictDoUpdate.mock.calls[0][0]
      expect(onConflictArg.set).toMatchObject({ timezone: 'America/New_York' })
    })

    it('accepts UTC', async () => {
      await handler.execute(new UpdateTenantTimezoneCommand(TENANT_ID, 'UTC'))
      expect(mock.insert).toHaveBeenCalledTimes(1)
    })

    it('accepts Asia/Ho_Chi_Minh', async () => {
      await handler.execute(new UpdateTenantTimezoneCommand(TENANT_ID, 'Asia/Ho_Chi_Minh'))
      expect(mock.insert).toHaveBeenCalledTimes(1)
    })
  })

  describe('when timezone is an unknown IANA zone', () => {
    it('throws BadRequestException', async () => {
      await expect(
        handler.execute(new UpdateTenantTimezoneCommand(TENANT_ID, 'Mars/Olympus_Mons')),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(mock.insert).not.toHaveBeenCalled()
    })
  })

  describe('when timezone is empty', () => {
    it('throws BadRequestException', async () => {
      await expect(
        handler.execute(new UpdateTenantTimezoneCommand(TENANT_ID, '')),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(mock.insert).not.toHaveBeenCalled()
    })
  })
})
