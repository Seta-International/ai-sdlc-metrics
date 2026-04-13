import { Inject, Injectable } from '@nestjs/common'
import { and, eq, gte, lte, count } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type {
  IAuditEventQueryRepository,
  AuditEventFilter,
  AuditEventExportFilter,
  AuditEventRow,
} from '../../domain/repositories/audit-event-query.repository.port'
import { auditEvent } from '../schema/index'

@Injectable()
export class DrizzleAuditEventQueryRepository implements IAuditEventQueryRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async query(filter: AuditEventFilter): Promise<{ items: AuditEventRow[]; total: number }> {
    const conditions = [eq(auditEvent.tenantId, filter.tenantId)]

    if (filter.actorId) conditions.push(eq(auditEvent.actorId, filter.actorId))
    if (filter.eventType) conditions.push(eq(auditEvent.eventType, filter.eventType))
    if (filter.module) conditions.push(eq(auditEvent.module, filter.module))
    if (filter.dateFrom) conditions.push(gte(auditEvent.createdAt, filter.dateFrom))
    if (filter.dateTo) conditions.push(lte(auditEvent.createdAt, filter.dateTo))

    const where = and(...conditions)

    const [items, countResult] = await Promise.all([
      this.db
        .select()
        .from(auditEvent)
        .where(where)
        .orderBy(auditEvent.createdAt)
        .limit(filter.limit)
        .offset(filter.offset),
      this.db.select({ value: count() }).from(auditEvent).where(where),
    ])

    return {
      items: items.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        actorId: row.actorId,
        eventType: row.eventType,
        module: row.module,
        subjectId: row.subjectId,
        payload: row.payload,
        createdAt: row.createdAt,
      })),
      total: Number(countResult[0]?.value ?? 0),
    }
  }

  async queryAll(filter: AuditEventExportFilter): Promise<AuditEventRow[]> {
    const conditions = [eq(auditEvent.tenantId, filter.tenantId)]

    if (filter.actorId) conditions.push(eq(auditEvent.actorId, filter.actorId))
    if (filter.eventType) conditions.push(eq(auditEvent.eventType, filter.eventType))
    if (filter.module) conditions.push(eq(auditEvent.module, filter.module))
    if (filter.dateFrom) conditions.push(gte(auditEvent.createdAt, filter.dateFrom))
    if (filter.dateTo) conditions.push(lte(auditEvent.createdAt, filter.dateTo))

    const rows = await this.db
      .select()
      .from(auditEvent)
      .where(and(...conditions))
      .orderBy(auditEvent.createdAt)

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      actorId: row.actorId,
      eventType: row.eventType,
      module: row.module,
      subjectId: row.subjectId,
      payload: row.payload,
      createdAt: row.createdAt,
    }))
  }
}
