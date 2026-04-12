import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportAuditLogQuery } from './export-audit-log.query'
import { ExportAuditLogHandler } from './export-audit-log.handler'
import type {
  IAuditEventQueryRepository,
  AuditEventRow,
} from '../../../kernel/domain/repositories/audit-event-query.repository.port'

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

describe('ExportAuditLogHandler', () => {
  let handler: ExportAuditLogHandler
  let auditQueryRepo: IAuditEventQueryRepository

  beforeEach(() => {
    auditQueryRepo = {
      query: vi.fn(),
    }
    handler = new ExportAuditLogHandler(auditQueryRepo)
  })

  it('returns CSV string with headers and data rows', async () => {
    vi.mocked(auditQueryRepo.query).mockResolvedValue({
      items: fakeEvents,
      total: 1,
    })

    const result = await handler.execute(new ExportAuditLogQuery(TENANT_ID))

    expect(result).toContain('id,actor_id,event_type,module,subject_id,payload,created_at')
    expect(result).toContain('01900000-0000-7000-8000-000000000070')
    expect(result).toContain('permission_check')
    expect(result).toContain('kernel')
  })

  it('returns only headers when no events match', async () => {
    vi.mocked(auditQueryRepo.query).mockResolvedValue({ items: [], total: 0 })

    const result = await handler.execute(new ExportAuditLogQuery(TENANT_ID))

    expect(result).toBe('id,actor_id,event_type,module,subject_id,payload,created_at')
  })
})
