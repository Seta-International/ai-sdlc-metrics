import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_QUERY_REPOSITORY,
  type IAuditEventQueryRepository,
} from '../../../kernel/domain/repositories/audit-event-query.repository.port'
import { ExportAuditLogQuery } from './export-audit-log.query'

const CSV_HEADER = 'id,actor_id,event_type,module,subject_id,payload,created_at'
const MAX_EXPORT_ROWS = 10_000

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

@QueryHandler(ExportAuditLogQuery)
export class ExportAuditLogHandler implements IQueryHandler<ExportAuditLogQuery, string> {
  constructor(
    @Inject(AUDIT_EVENT_QUERY_REPOSITORY)
    private readonly auditQueryRepo: IAuditEventQueryRepository,
  ) {}

  async execute(query: ExportAuditLogQuery): Promise<string> {
    const { items } = await this.auditQueryRepo.query({
      tenantId: query.tenantId,
      actorId: query.actorId,
      eventType: query.eventType,
      module: query.module,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: MAX_EXPORT_ROWS,
      offset: 0,
    })

    if (items.length === 0) return CSV_HEADER

    const rows = items.map((event) => {
      return [
        csvEscape(event.id),
        csvEscape(event.actorId),
        csvEscape(event.eventType),
        csvEscape(event.module),
        csvEscape(event.subjectId),
        csvEscape(JSON.stringify(event.payload)),
        csvEscape(event.createdAt.toISOString()),
      ].join(',')
    })

    return [CSV_HEADER, ...rows].join('\n')
  }
}
