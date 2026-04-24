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
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/repositories/tenant.repository.port'
import type { Tenant } from '../../domain/entities/tenant.entity'
import { TenantNotFoundException } from '../../domain/exceptions/tenant.exceptions'
export { SYSTEM_TENANT_SLUG } from '../../domain/constants/system-tenant'

/**
 * KernelAuditFacade — the only cross-module write interface for audit, outbox events,
 * and tenant mutations.
 * Other modules must NOT inject AUDIT_EVENT_REPOSITORY, OUTBOX_EVENT_REPOSITORY, or
 * TENANT_REPOSITORY directly.
 */
@Injectable()
export class KernelAuditFacade {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
    @Inject(OUTBOX_EVENT_REPOSITORY)
    private readonly outboxRepo: IOutboxEventRepository,
    @Inject(TENANT_REPOSITORY)
    private readonly tenantRepo: ITenantRepository,
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
      dateFrom?: Date
      dateTo?: Date
      limit?: number
      offset?: number
    },
  ): Promise<{ items: AuditEventRow[]; total: number }> {
    return this.auditRepo.query({
      tenantId,
      actorId: filters.actorId,
      eventType: filters.eventType,
      module: filters.module,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    })
  }

  exportAuditLog(
    tenantId: string,
    filters: {
      actorId?: string
      eventType?: string
      module?: string
      dateFrom?: Date
      dateTo?: Date
    },
  ): Promise<AuditEventRow[]> {
    return this.auditRepo.queryAll({
      tenantId,
      actorId: filters.actorId,
      eventType: filters.eventType,
      module: filters.module,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    })
  }

  /**
   * Update the status of a tenant. Platform admin write operation.
   * Throws TenantNotFoundException if no tenant with the given ID exists.
   */
  async updateTenantStatus(id: string, status: Tenant['status']): Promise<void> {
    const updated = await this.tenantRepo.updateStatus(id, status)
    if (!updated) {
      throw new TenantNotFoundException(id)
    }
  }
}
