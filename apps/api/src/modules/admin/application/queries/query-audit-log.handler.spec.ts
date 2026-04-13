import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryAuditLogQuery } from './query-audit-log.query'
import { QueryAuditLogHandler } from './query-audit-log.handler'
import type { AuditEventRow } from '../../../kernel/domain/repositories/audit-event-query.repository.port'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeEvents: AuditEventRow[] = [
  {
    id: '01900000-0000-7000-8000-000000000070',
    tenantId: TENANT_ID,
    actorId: '01900000-0000-7000-8000-000000000005',
    eventType: 'permission_check',
    module: 'kernel',
    subjectId: '01900000-0000-7000-8000-000000000050',
    payload: { permission: 'people:profile:read', result: 'denied' },
    createdAt: new Date('2026-04-11T10:00:00Z'),
  },
]

describe('QueryAuditLogHandler', () => {
  let handler: QueryAuditLogHandler
  let auditFacade: Pick<KernelAuditFacade, 'queryAuditLog'>

  beforeEach(() => {
    auditFacade = {
      queryAuditLog: vi.fn(),
    }
    handler = new QueryAuditLogHandler(auditFacade as unknown as KernelAuditFacade)
  })

  it('returns paginated audit events matching filters', async () => {
    vi.mocked(auditFacade.queryAuditLog).mockResolvedValue({
      items: fakeEvents,
      total: 1,
    })

    const result = await handler.execute(
      new QueryAuditLogQuery(TENANT_ID, undefined, 'permission_check', 'kernel'),
    )

    expect(result).toEqual({ items: fakeEvents, total: 1 })
    expect(auditFacade.queryAuditLog).toHaveBeenCalledWith(TENANT_ID, {
      actorId: undefined,
      eventType: 'permission_check',
      module: 'kernel',
      dateFrom: undefined,
      dateTo: undefined,
      limit: 50,
      offset: 0,
    })
  })

  it('returns empty results when no events match', async () => {
    vi.mocked(auditFacade.queryAuditLog).mockResolvedValue({ items: [], total: 0 })

    const result = await handler.execute(new QueryAuditLogQuery(TENANT_ID))

    expect(result).toEqual({ items: [], total: 0 })
  })
})
