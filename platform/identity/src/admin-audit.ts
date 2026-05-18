export interface AuditWriter {
  recordAudit(args: {
    tenantId: string
    actor: { type: 'user'; userId: string } | { type: 'system'; label: string }
    providerId?: string
    operation: string
    result: 'ok' | 'failure'
    metadata?: Record<string, unknown>
  }): Promise<void>
}

export type SsoAuditEvent =
  | 'sso.config_created'
  | 'sso.config_updated'
  | 'sso.config_deleted'
  | 'sso.secret_rotated'
  | 'sso.domain_added'
  | 'sso.domain_removed'
  | 'sso.test_run'

export async function recordSsoAudit(
  writer: AuditWriter,
  input: {
    event: SsoAuditEvent
    actorUserId: string
    tenantId: string
    metadata?: Record<string, unknown>
    result?: 'ok' | 'failure'
  },
): Promise<void> {
  await writer.recordAudit({
    tenantId: input.tenantId,
    actor: { type: 'user', userId: input.actorUserId },
    providerId: 'entra',
    operation: input.event,
    result: input.result ?? 'ok',
    metadata: input.metadata ?? {},
  })
}
