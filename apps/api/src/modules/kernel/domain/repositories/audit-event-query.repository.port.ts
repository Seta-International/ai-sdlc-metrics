export const AUDIT_EVENT_QUERY_REPOSITORY = Symbol('IAuditEventQueryRepository')

export interface AuditEventFilter {
  tenantId: string
  actorId?: string
  eventType?: string
  module?: string
  dateFrom?: Date
  dateTo?: Date
  limit: number
  offset: number
}

export interface AuditEventRow {
  id: string
  tenantId: string
  actorId: string
  eventType: string
  module: string
  subjectId: string
  payload: unknown
  createdAt: Date
}

export interface AuditEventExportFilter {
  tenantId: string
  actorId?: string
  eventType?: string
  module?: string
  dateFrom?: Date
  dateTo?: Date
}

export interface IAuditEventQueryRepository {
  query(filter: AuditEventFilter): Promise<{ items: AuditEventRow[]; total: number }>
  queryAll(filter: AuditEventExportFilter): Promise<AuditEventRow[]>
}
