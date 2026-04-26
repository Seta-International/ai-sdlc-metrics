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
import {
  USER_IDENTITY_REPOSITORY,
  type IUserIdentityRepository,
  PLACEHOLDER_SSO_SUBJECT_PREFIX,
} from '../../domain/repositories/user-identity.repository.port'
import type { UserIdentity } from '../../domain/entities/user-identity.entity'
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
    @Inject(USER_IDENTITY_REPOSITORY)
    private readonly userIdentityRepo: IUserIdentityRepository,
  ) {}

  recordEvent(data: {
    tenantId: string
    actorId: string
    eventType: string
    module: string
    subjectId: string
    payload: unknown
    /** Plan 07 §3 — optional flow correlation id */
    flowId?: string | null
    /** Plan 07 §3 — optional intent slug (max 120 chars) */
    intentSlug?: string | null
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
   * Binds a real SSO subject to a seeded placeholder identity.
   * Returns true if the claim was applied (subject had the placeholder prefix),
   * false if the identity already had a real subject.
   * Called once on the user's first real SSO login.
   */
  async claimSsoSubjectIfPlaceholder(
    identity: { id: string; tenantId: string; ssoSubject: string },
    realSsoSubject: string,
    provider: UserIdentity['provider'],
  ): Promise<boolean> {
    if (!identity.ssoSubject.startsWith(PLACEHOLDER_SSO_SUBJECT_PREFIX)) {
      return false
    }
    await this.userIdentityRepo.claimSsoSubject(
      identity.id,
      identity.tenantId,
      realSsoSubject,
      provider,
    )
    return true
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
