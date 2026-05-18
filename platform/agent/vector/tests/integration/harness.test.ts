import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeTestSql, ensureMigrations, testSql } from './_helpers'

beforeAll(async () => {
  await ensureMigrations()
})

afterAll(async () => {
  await closeTestSql()
})

describe('agent_vector integration harness', () => {
  it('agent_vector schema exists', async () => {
    const rows = await testSql()`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name = 'agent_vector'
    `
    expect(rows.length).toBe(1)
  })

  it('chunks table exists with RLS enabled AND forced', async () => {
    const rows = await testSql()`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname='agent_vector')
        AND relkind='r'
      ORDER BY relname
    `
    expect(rows.map((r) => r.relname)).toEqual(['chunks'])
    expect(rows[0]?.relrowsecurity).toBe(true)
    expect(rows[0]?.relforcerowsecurity).toBe(true)
  })

  it('tenant_isolation_chunks policy is scoped to tenant_user', async () => {
    const rows = await testSql()`
      SELECT polname, polroles::regrole[]
      FROM pg_policy
      WHERE polrelid = 'agent_vector.chunks'::regclass
    `
    expect(rows.length).toBe(1)
    expect(rows[0]?.polname).toBe('tenant_isolation_chunks')
    expect(String(rows[0]?.polroles)).toContain('tenant_user')
  })

  it('unique index on (tenant_id, source_id, content_hash) exists', async () => {
    const rows = await testSql()`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'agent_vector'
        AND tablename = 'chunks'
        AND indexname = 'chunks_tenant_source_hash_unique'
    `
    expect(rows.length).toBe(1)
    expect(rows[0]?.indexdef).toMatch(/UNIQUE/)
    expect(rows[0]?.indexdef).toMatch(/tenant_id.*source_id.*content_hash/i)
  })

  it('HNSW index uses vector_cosine_ops opclass', async () => {
    const rows = await testSql()`
      SELECT i.relname AS indexname, am.amname
      FROM pg_class i
      JOIN pg_index ix ON ix.indexrelid = i.oid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_am am ON am.oid = i.relam
      WHERE n.nspname = 'agent_vector'
        AND t.relname = 'chunks'
        AND i.relname = 'chunks_embedding_idx'
    `
    expect(rows.length).toBe(1)
    expect(rows[0]?.amname).toBe('hnsw')

    const defs = await testSql()`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'agent_vector'
        AND indexname = 'chunks_embedding_idx'
    `
    expect(defs[0]?.indexdef).toMatch(/vector_cosine_ops/)
  })

  it('tenant_user has SELECT/INSERT/UPDATE/DELETE on chunks', async () => {
    const rows = await testSql()`
      SELECT privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'agent_vector'
        AND table_name = 'chunks'
        AND grantee = 'tenant_user'
      ORDER BY privilege_type
    `
    expect(rows.map((r) => r.privilege_type).sort()).toEqual(
      ['DELETE', 'INSERT', 'SELECT', 'UPDATE'].sort(),
    )
  })
})
