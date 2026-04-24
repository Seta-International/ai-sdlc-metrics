import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ForbiddenException } from '@nestjs/common'
import type { Db } from '@future/db'
import { UpdateModuleTogglesCommand } from './update-module-toggles.command'
import { UpdateModuleTogglesHandler } from './update-module-toggles.handler'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const OTHER_TENANT_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000010'

interface MockDb {
  insert: ReturnType<typeof vi.fn>
  values: ReturnType<typeof vi.fn>
  onConflictDoUpdate: ReturnType<typeof vi.fn>
}

function makeDb(): { db: Db; mock: MockDb } {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
  const insert = vi.fn().mockReturnValue({ values })
  return {
    db: { insert } as unknown as Db,
    mock: { insert, values, onConflictDoUpdate },
  }
}

describe('UpdateModuleTogglesHandler', () => {
  let handler: UpdateModuleTogglesHandler
  let mock: MockDb
  let auditFacade: Pick<KernelAuditFacade, 'recordEvent'>

  beforeEach(() => {
    const made = makeDb()
    mock = made.mock
    auditFacade = { recordEvent: vi.fn().mockResolvedValue(undefined) }
    handler = new UpdateModuleTogglesHandler(made.db, auditFacade as unknown as KernelAuditFacade)
  })

  describe('tenant isolation', () => {
    it('throws ForbiddenException when tenant_admin writes to a different tenant', async () => {
      const command = new UpdateModuleTogglesCommand(
        OTHER_TENANT_ID,
        ACTOR_ID,
        [{ moduleKey: 'people', enabled: true }],
        TENANT_ID,
        ['tenant_admin'],
      )

      await expect(handler.execute(command)).rejects.toBeInstanceOf(ForbiddenException)
      expect(mock.insert).not.toHaveBeenCalled()
      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })

    it('allows platform_admin to write to any tenant', async () => {
      const command = new UpdateModuleTogglesCommand(
        OTHER_TENANT_ID,
        ACTOR_ID,
        [{ moduleKey: 'people', enabled: true }],
        TENANT_ID,
        ['platform_admin'],
      )

      await handler.execute(command)

      expect(mock.insert).toHaveBeenCalledOnce()
      expect(auditFacade.recordEvent).toHaveBeenCalledOnce()
    })
  })

  describe('happy path', () => {
    it('upserts each toggle sequentially and writes audit', async () => {
      const toggles = [
        { moduleKey: 'people', enabled: true },
        { moduleKey: 'hiring', enabled: false },
      ]
      const command = new UpdateModuleTogglesCommand(TENANT_ID, ACTOR_ID, toggles, TENANT_ID, [
        'tenant_admin',
      ])

      await handler.execute(command)

      expect(mock.insert).toHaveBeenCalledTimes(2)
      expect(mock.values).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ tenantId: TENANT_ID, moduleKey: 'people', enabled: true }),
      )
      expect(mock.values).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ tenantId: TENANT_ID, moduleKey: 'hiring', enabled: false }),
      )
      expect(auditFacade.recordEvent).toHaveBeenCalledOnce()
    })

    it('writes audit with correct event type and payload', async () => {
      const toggles = [{ moduleKey: 'time', enabled: true }]
      const command = new UpdateModuleTogglesCommand(TENANT_ID, ACTOR_ID, toggles, TENANT_ID, [
        'tenant_admin',
      ])

      await handler.execute(command)

      expect(auditFacade.recordEvent).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        eventType: 'admin.module_toggles_updated',
        module: 'admin',
        subjectId: TENANT_ID,
        payload: { toggles },
      })
    })

    it('handles empty toggles array (no-op writes, still writes audit)', async () => {
      const command = new UpdateModuleTogglesCommand(TENANT_ID, ACTOR_ID, [], TENANT_ID, [
        'tenant_admin',
      ])
      await handler.execute(command)
      expect(mock.insert).not.toHaveBeenCalled()
      expect(auditFacade.recordEvent).toHaveBeenCalledOnce()
    })
  })
})
