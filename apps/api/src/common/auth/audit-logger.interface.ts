/**
 * Narrow write-only interface for recording audit events.
 * Defined in common/ so that tRPC middleware and routers do not import
 * kernel domain repository ports directly.
 * KernelAuditService satisfies this interface at runtime.
 */
export interface IAuditLogger {
  insert(data: {
    tenantId: string
    actorId: string
    eventType: string
    module: string
    subjectId: string
    payload: unknown
  }): Promise<void>
}
