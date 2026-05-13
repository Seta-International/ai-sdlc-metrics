import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { createAuditWriter } from './writer'

const URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5433/seta'

describe('recordAudit', () => {
  const sql = postgres(URL, { max: 1, prepare: false })
  const writer = createAuditWriter(sql)

  afterAll(async () => {
    await sql.end()
  })

  it('inserts a row with the given operation and metadata', async () => {
    const tenantId = '33333333-3333-3333-3333-333333333333'
    await writer.recordAudit({
      tenantId,
      actor: { type: 'system', label: 'test' },
      operation: 'test.event',
      result: 'ok',
      metadata: { foo: 'bar' },
    })
    const rows = await sql<
      {
        operation: string
        actor_type: string
        actor_id: string
        result: string
        metadata: Record<string, unknown>
      }[]
    >`
      SELECT operation, actor_type, actor_id, result, metadata
        FROM audit.audit_log
       WHERE tenant_id = ${tenantId}
       ORDER BY ts DESC
       LIMIT 1
    `
    expect(rows[0]?.operation).toBe('test.event')
    expect(rows[0]?.actor_type).toBe('system')
    expect(rows[0]?.actor_id).toBe('test')
    expect(rows[0]?.result).toBe('ok')
    expect(rows[0]?.metadata).toMatchObject({ foo: 'bar' })
  })
})
