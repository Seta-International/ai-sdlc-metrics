import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureMigrations, testSql } from './_helpers'

beforeAll(async () => {
  await ensureMigrations()
})

afterAll(async () => {
  await testSql().end({ timeout: 2 })
})

describe('integration harness', () => {
  it('agent_memory schema exists', async () => {
    const rows = await testSql()`
      SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'agent_memory'
    `
    expect(rows.length).toBe(1)
  })

  it('all three tables exist with RLS enabled and forced', async () => {
    const rows = await testSql()`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname='agent_memory')
        AND relkind='r'
      ORDER BY relname
    `
    expect(rows.map((r) => r.relname)).toEqual(['conversations', 'turns', 'working_memory'])
    expect(rows.every((r) => r.relrowsecurity === true)).toBe(true)
    expect(rows.every((r) => r.relforcerowsecurity === true)).toBe(true)
  })

  it('each table has tenant_isolation_* policy with correct expression for tenant_user', async () => {
    const rows = await testSql()<
      Array<{ polname: string; qual: string; with_check: string; roles: string[] }>
    >`
      SELECT
        p.polname,
        pg_get_expr(p.polqual, p.polrelid)      AS qual,
        pg_get_expr(p.polwithcheck, p.polrelid) AS with_check,
        ARRAY(
          SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles)
        ) AS roles
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'agent_memory'
        AND p.polname LIKE 'tenant_isolation_%'
      ORDER BY p.polname
    `

    const EXPECTED_TABLES = [
      'tenant_isolation_conversations',
      'tenant_isolation_turns',
      'tenant_isolation_working_memory',
    ]
    expect(rows.map((r) => r.polname)).toEqual(EXPECTED_TABLES)

    const EXPECTED_EXPR = `(tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)`
    for (const row of rows) {
      expect(row.qual, `${row.polname} USING`).toBe(EXPECTED_EXPR)
      expect(row.with_check, `${row.polname} WITH CHECK`).toBe(EXPECTED_EXPR)
      expect(row.roles, `${row.polname} role`).toContain('tenant_user')
    }
  })
})
