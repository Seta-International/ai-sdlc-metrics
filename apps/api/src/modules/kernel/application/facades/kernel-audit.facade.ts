import { Injectable, Inject } from '@nestjs/common'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../domain/repositories/audit-event.repository.port'
import type { AuditEventRow } from '../../domain/repositories/audit-event-query.repository.port'
import {
  OUTBOX_EVENT_REPOSITORY,
  type IOutboxEventRepository,
} from '../../domain/repositories/outbox-event.repository.port'

/**
 * KernelAuditFacade — the only cross-module write interface for audit and outbox events.
 * Other modules must NOT inject AUDIT_EVENT_REPOSITORY or OUTBOX_EVENT_REPOSITORY directly.
 */
@Injectable()
export class KernelAuditFacade {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
    @Inject(OUTBOX_EVENT_REPOSITORY)
    private readonly outboxRepo: IOutboxEventRepository,
  ) {}

  recordEvent(data: {
    tenantId: string
    actorId: string
    eventType: string
    module: string
    subjectId: string
    payload: unknown
  }): Promise<void> {
    return this.auditRepo.insert(data)
  }

  publishOutboxEvent(data: {
    tenantId: string
    eventName: string
    payload: unknown
  }): Promise<void> {
    return this.outboxRepo.insert(data)
  }

  queryAuditLog(
    tenantId: string,
    filters: {
      actorId?: string
      eventType?: string
      module?: string
      dateFrom?: string
      dateTo?: string
      limit?: number
      offset?: number
    },
  ): Promise<{ items: AuditEventRow[]; total: number }> {
    return this.auditRepo.query({ tenantId, ...filters } as any)
  }

  exportAuditLog(
    tenantId: string,
    filters: {
      actorId?: string
      eventType?: string
      module?: string
      dateFrom?: string
      dateTo?: string
    },
  ): Promise<AuditEventRow[]> {
    return this.auditRepo.queryAll({ tenantId, ...filters } as any)
  }
}
