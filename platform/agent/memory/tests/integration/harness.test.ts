import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeTestSql, ensureMigrations, testSql } from './_helpers'

beforeAll(async () => {
  await ensureMigrations()
})

afterAll(async () => {
  await closeTestSql()
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
    expect(rows.map((r) => r.relname)).toEqual(['messages', 'resources', 'threads'])
    expect(rows.every((r) => r.relrowsecurity === true)).toBe(true)
    expect(rows.every((r) => r.relforcerowsecurity === true)).toBe(true)
  })
})
