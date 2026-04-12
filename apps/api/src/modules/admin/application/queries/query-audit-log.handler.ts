import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_QUERY_REPOSITORY,
  type IAuditEventQueryRepository,
  type AuditEventRow,
} from '../../../kernel/domain/repositories/audit-event-query.repository.port'
import { QueryAuditLogQuery } from './query-audit-log.query'

export interface AuditLogResultDto {
  items: AuditEventRow[]
  total: number
}

@QueryHandler(QueryAuditLogQuery)
export class QueryAuditLogHandler implements IQueryHandler<QueryAuditLogQuery, AuditLogResultDto> {
  constructor(
    @Inject(AUDIT_EVENT_QUERY_REPOSITORY)
    private readonly auditQueryRepo: IAuditEventQueryRepository,
  ) {}

  async execute(query: QueryAuditLogQuery): Promise<AuditLogResultDto> {
    return this.auditQueryRepo.query({
      tenantId: query.tenantId,
      actorId: query.actorId,
      eventType: query.eventType,
      module: query.module,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: query.limit,
      offset: query.offset,
    })
  }
}
