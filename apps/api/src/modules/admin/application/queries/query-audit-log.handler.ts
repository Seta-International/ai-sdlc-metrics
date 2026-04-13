import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { QueryAuditLogQuery } from './query-audit-log.query'

export interface AuditLogResultDto {
  items: unknown[]
  total: number
}

@QueryHandler(QueryAuditLogQuery)
export class QueryAuditLogHandler implements IQueryHandler<QueryAuditLogQuery, AuditLogResultDto> {
  constructor(private readonly auditFacade: KernelAuditFacade) {}

  async execute(query: QueryAuditLogQuery): Promise<AuditLogResultDto> {
    return this.auditFacade.queryAuditLog(query.tenantId, {
      actorId: query.actorId,
      eventType: query.eventType,
      module: query.module,
      dateFrom: query.dateFrom as unknown as string,
      dateTo: query.dateTo as unknown as string,
      limit: query.limit,
      offset: query.offset,
    })
  }
}
