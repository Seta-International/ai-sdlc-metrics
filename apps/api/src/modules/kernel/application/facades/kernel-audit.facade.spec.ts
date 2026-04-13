import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KernelAuditFacade } from './kernel-audit.facade'
import type { IAuditEventRepository } from '../../domain/repositories/audit-event.repository.port'
import type { IOutboxEventRepository } from '../../domain/repositories/outbox-event.repository.port'

describe('KernelAuditFacade', () => {
  let facade: KernelAuditFacade
  let auditRepo: {
    insert: ReturnType<typeof vi.fn>
    query: ReturnType<typeof vi.fn>
    queryAll: ReturnType<typeof vi.fn>
  }
  let outboxRepo: { insert: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    auditRepo = { insert: vi.fn(), query: vi.fn(), queryAll: vi.fn() }
    outboxRepo = { insert: vi.fn() }
    facade = new KernelAuditFacade(
      auditRepo as unknown as IAuditEventRepository,
      outboxRepo as unknown as IOutboxEventRepository,
    )
  })

  describe('queryAuditLog', () => {
    it('delegates to auditRepo.query', async () => {
      const result = { items: [], total: 0 }
      auditRepo.query.mockResolvedValue(result)

      const actual = await facade.queryAuditLog('tenant-1', { limit: 10, offset: 0 })

      expect(auditRepo.query).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        limit: 10,
        offset: 0,
      })
      expect(actual).toBe(result)
    })
  })

  describe('exportAuditLog', () => {
    it('delegates to auditRepo.queryAll', async () => {
      const rows = [{ id: '1' }]
      auditRepo.queryAll.mockResolvedValue(rows)

      const actual = await facade.exportAuditLog('tenant-1', {})

      expect(auditRepo.queryAll).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
      })
      expect(actual).toBe(rows)
    })
  })
})
