import type { Sql } from 'postgres'

export type AuditActor = { type: 'user'; userId: string } | { type: 'system'; label: string }

export type AuditEntry = {
  tenantId: string
  actor: AuditActor
  providerId?: string
  connectorId?: string
  operation: string
  resource?: { type: string; ids: string[] }
  result: 'ok' | 'failure'
  metadata?: Record<string, unknown>
}

export interface AuditWriter {
  recordAudit(entry: AuditEntry): Promise<void>
}

export function createAuditWriter(sql: Sql): AuditWriter {
  return {
    async recordAudit(e) {
      const actorType = e.actor.type
      const actorId = e.actor.type === 'user' ? e.actor.userId : e.actor.label
      await sql`
        INSERT INTO audit.audit_log
          (tenant_id, actor_type, actor_id, provider_id, connector_id,
           operation, resource_type, resource_ids, result, metadata)
        VALUES
          (${e.tenantId}, ${actorType}, ${actorId}, ${e.providerId ?? null}, ${e.connectorId ?? null},
           ${e.operation}, ${e.resource?.type ?? null}, ${e.resource?.ids ?? null},
           ${e.result}, ${sql.json((e.metadata ?? {}) as never)})
      `
    },
  }
}

/** Convenience top-level helper for code that already has a sql instance. */
export async function recordAudit(sql: Sql, e: AuditEntry): Promise<void> {
  return createAuditWriter(sql).recordAudit(e)
}
