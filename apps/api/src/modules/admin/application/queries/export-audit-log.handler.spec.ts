import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportAuditLogQuery } from './export-audit-log.query'
import { ExportAuditLogHandler } from './export-audit-log.handler'
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

describe('ExportAuditLogHandler', () => {
  let handler: ExportAuditLogHandler
  let auditFacade: Pick<KernelAuditFacade, 'exportAuditLog'>

  beforeEach(() => {
    auditFacade = {
      exportAuditLog: vi.fn(),
    }
    handler = new ExportAuditLogHandler(auditFacade as unknown as KernelAuditFacade)
  })

  it('returns CSV string with headers and data rows', async () => {
    vi.mocked(auditFacade.exportAuditLog).mockResolvedValue(fakeEvents)

    const result = await handler.execute(new ExportAuditLogQuery(TENANT_ID))

    expect(result).toContain('id,actor_id,event_type,module,subject_id,payload,created_at')
    expect(result).toContain('01900000-0000-7000-8000-000000000070')
    expect(result).toContain('permission_check')
    expect(result).toContain('kernel')
  })

  it('returns only headers when no events match', async () => {
    vi.mocked(auditFacade.exportAuditLog).mockResolvedValue([])

    const result = await handler.execute(new ExportAuditLogQuery(TENANT_ID))

    expect(result).toBe('id,actor_id,event_type,module,subject_id,payload,created_at')
  })
})
