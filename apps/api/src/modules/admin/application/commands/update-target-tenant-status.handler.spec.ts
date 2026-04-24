import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import { UpdateTargetTenantStatusCommand } from './update-target-tenant-status.command'
import { UpdateTargetTenantStatusHandler } from './update-target-tenant-status.handler'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { TenantSummaryDto } from '../../../kernel/application/queries/list-tenants.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000009001'
const ACTOR_ID = '01900000-0000-7000-8000-000000009002'
const TARGET_TENANT_ID = '01900000-0000-7000-8000-000000000001'
const SYSTEM_TENANT_ID = '01900000-0000-7000-8000-aaaaaaaaaaaa'

const makeTargetTenant = (overrides: Partial<TenantSummaryDto> = {}): TenantSummaryDto => ({
  id: TARGET_TENANT_ID,
  name: 'SETA International',
  slug: 'seta',
  status: 'active',
  planTier: 'enterprise',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const makeSystemTenant = (): TenantSummaryDto => ({
  id: SYSTEM_TENANT_ID,
  name: 'Future System',
  slug: 'future-system',
  status: 'active',
  planTier: 'enterprise',
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('UpdateTargetTenantStatusHandler', () => {
  let handler: UpdateTargetTenantStatusHandler
  let kernelQuery: Pick<KernelQueryFacade, 'getTenant' | 'updateTenantStatus'>
  let auditFacade: Pick<KernelAuditFacade, 'recordEvent'>

  beforeEach(() => {
    kernelQuery = {
      getTenant: vi.fn(),
      updateTenantStatus: vi.fn(),
    }
    auditFacade = {
      recordEvent: vi.fn(),
    }
    handler = new UpdateTargetTenantStatusHandler(
      kernelQuery as unknown as KernelQueryFacade,
      auditFacade as unknown as KernelAuditFacade,
    )
  })

  describe('happy path — update tenant status', () => {
    it('updates the target tenant status and records audit', async () => {
      const targetTenant = makeTargetTenant({ status: 'active' })
      vi.mocked(kernelQuery.getTenant).mockResolvedValue(targetTenant)
      vi.mocked(kernelQuery.updateTenantStatus).mockResolvedValue(undefined)
      vi.mocked(auditFacade.recordEvent).mockResolvedValue(undefined)

      const command = new UpdateTargetTenantStatusCommand(
        TENANT_ID,
        ACTOR_ID,
        TARGET_TENANT_ID,
        'suspended',
      )
      await handler.execute(command)

      expect(kernelQuery.getTenant).toHaveBeenCalledWith(TARGET_TENANT_ID)
      expect(kernelQuery.updateTenantStatus).toHaveBeenCalledWith(TARGET_TENANT_ID, 'suspended')
      expect(auditFacade.recordEvent).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        eventType: 'tenant.status_updated',
        module: 'admin',
        subjectId: TARGET_TENANT_ID,
        payload: {
          targetTenantId: TARGET_TENANT_ID,
          previousStatus: 'active',
          nextStatus: 'suspended',
        },
      })
    })

    it('records audit payload with targetTenantId, previousStatus, nextStatus', async () => {
      const targetTenant = makeTargetTenant({ status: 'suspended' })
      vi.mocked(kernelQuery.getTenant).mockResolvedValue(targetTenant)
      vi.mocked(kernelQuery.updateTenantStatus).mockResolvedValue(undefined)
      vi.mocked(auditFacade.recordEvent).mockResolvedValue(undefined)

      const command = new UpdateTargetTenantStatusCommand(
        TENANT_ID,
        ACTOR_ID,
        TARGET_TENANT_ID,
        'active',
      )
      await handler.execute(command)

      const auditCall = vi.mocked(auditFacade.recordEvent).mock.calls[0]![0]
      expect(auditCall.payload).toEqual({
        targetTenantId: TARGET_TENANT_ID,
        previousStatus: 'suspended',
        nextStatus: 'active',
      })
    })
  })

  describe('system tenant guard', () => {
    it('throws BadRequestException when attempting to suspend the system tenant', async () => {
      const systemTenant = makeSystemTenant()
      vi.mocked(kernelQuery.getTenant).mockResolvedValue(systemTenant)

      const command = new UpdateTargetTenantStatusCommand(
        TENANT_ID,
        ACTOR_ID,
        SYSTEM_TENANT_ID,
        'suspended',
      )

      await expect(handler.execute(command)).rejects.toBeInstanceOf(BadRequestException)
      expect(kernelQuery.updateTenantStatus).not.toHaveBeenCalled()
      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })

    it('throws BadRequestException when attempting to cancel the system tenant', async () => {
      const systemTenant = makeSystemTenant()
      vi.mocked(kernelQuery.getTenant).mockResolvedValue(systemTenant)

      const command = new UpdateTargetTenantStatusCommand(
        TENANT_ID,
        ACTOR_ID,
        SYSTEM_TENANT_ID,
        'cancelled',
      )

      await expect(handler.execute(command)).rejects.toBeInstanceOf(BadRequestException)
      expect(kernelQuery.updateTenantStatus).not.toHaveBeenCalled()
    })

    it('allows re-activating the system tenant', async () => {
      // System tenant should be protectable from suspend/cancel only, not from re-activation
      // (though in practice this scenario would rarely happen)
      const systemTenant = makeSystemTenant()
      vi.mocked(kernelQuery.getTenant).mockResolvedValue(systemTenant)
      vi.mocked(kernelQuery.updateTenantStatus).mockResolvedValue(undefined)
      vi.mocked(auditFacade.recordEvent).mockResolvedValue(undefined)

      const command = new UpdateTargetTenantStatusCommand(
        TENANT_ID,
        ACTOR_ID,
        SYSTEM_TENANT_ID,
        'active',
      )

      await expect(handler.execute(command)).resolves.not.toThrow()
    })
  })

  describe('error paths', () => {
    it('throws BadRequestException when target tenant does not exist', async () => {
      vi.mocked(kernelQuery.getTenant).mockResolvedValue(null)

      const command = new UpdateTargetTenantStatusCommand(
        TENANT_ID,
        ACTOR_ID,
        TARGET_TENANT_ID,
        'suspended',
      )

      await expect(handler.execute(command)).rejects.toBeInstanceOf(BadRequestException)
      expect(kernelQuery.updateTenantStatus).not.toHaveBeenCalled()
      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })
  })
})
