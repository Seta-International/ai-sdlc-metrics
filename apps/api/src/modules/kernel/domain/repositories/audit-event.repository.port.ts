export const AUDIT_EVENT_REPOSITORY = Symbol('IAuditEventRepository')

export interface IAuditEventRepository {
  insert(data: {
    tenantId: string
    actorId: string
    eventType: string
    module: string
    subjectId: string
    payload: unknown
  }): Promise<void>
}
