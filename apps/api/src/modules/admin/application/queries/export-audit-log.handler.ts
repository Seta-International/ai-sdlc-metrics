import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { ExportAuditLogQuery } from './export-audit-log.query'

const CSV_HEADER = 'id,actor_id,event_type,module,subject_id,payload,created_at'

@QueryHandler(ExportAuditLogQuery)
export class ExportAuditLogHandler implements IQueryHandler<ExportAuditLogQuery, string> {
  constructor(private readonly auditFacade: KernelAuditFacade) {}

  async execute(query: ExportAuditLogQuery): Promise<string> {
    const items = await this.auditFacade.exportAuditLog(query.tenantId, {
      actorId: query.actorId,
      eventType: query.eventType,
      module: query.module,
      dateFrom: query.dateFrom as unknown as string,
      dateTo: query.dateTo as unknown as string,
    })

    if (items.length === 0) return CSV_HEADER

    const rows = items.map((event) => {
      const payloadStr = JSON.stringify(event.payload).replace(/"/g, '""')
      return [
        event.id,
        event.actorId,
        event.eventType,
        event.module,
        event.subjectId,
        `"${payloadStr}"`,
        event.createdAt.toISOString(),
      ].join(',')
    })

    return [CSV_HEADER, ...rows].join('\n')
  }
}
