export const AUDIT_EVENT_REPOSITORY = Symbol('IAuditEventRepository')

import type {
  AuditEventFilter,
  AuditEventExportFilter,
  AuditEventRow,
} from './audit-event-query.repository.port'

export interface IAuditEventRepository {
  insert(data: {
    tenantId: string
    actorId: string
    eventType: string
    module: string
    subjectId: string
    payload: unknown
  }): Promise<void>
  query(filter: AuditEventFilter): Promise<{ items: AuditEventRow[]; total: number }>
  queryAll(filter: AuditEventExportFilter): Promise<AuditEventRow[]>
}
