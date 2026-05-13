import { OWNER_ORDER } from '@seta/db'
import { afterAll, describe, expect, it } from 'vitest'
import { getAdminPool } from './support/db'

const sql = getAdminPool()

describe('migration runner', () => {
  afterAll(async () => {
    await sql.end()
  })

  it('agent_workflows is in OWNER_ORDER after agent_memory', () => {
    const idxMemory = OWNER_ORDER.indexOf('agent_memory')
    const idxWorkflows = OWNER_ORDER.indexOf('agent_workflows')
    expect(idxMemory).toBeGreaterThanOrEqual(0)
    expect(idxWorkflows).toBeGreaterThan(idxMemory)
  })

  it('agent_workflows schema is present with RLS forced', async () => {
    const rows = await sql<
      Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>
    >`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'agent_workflows' AND c.relkind = 'r'
      ORDER BY c.relname
    `
    expect(rows.map((r) => r.relname)).toEqual(['workflow_snapshots', 'workflow_steps'])
    for (const r of rows) {
      expect(r.relrowsecurity).toBe(true)
      expect(r.relforcerowsecurity).toBe(true)
    }
  })
})
