/**
 * Integration tests for migration squash — P0 audit findings.
 *
 * Verifies:
 *   A) RLS enabled + forced on every tenant-scoped agents.* table and
 *      core.agent_delegation
 *   B) kernel audit_event has flow_id and intent_slug columns (with indexes)
 *   C) agent_message_fts_idx GIN FTS index exists
 *   D) agent_tool_result_cache unique constraint exists
 *   E) pg_policies: a <table>_tenant_isolation policy exists for every
 *      RLS-protected table, with USING/WITH CHECK referencing current_setting
 *   F) Unset tenant_id returns empty results (no PostgreSQL error)
 */
import { sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, migrateForTest } from '@future/db/test-helpers'
import { AGENTS_TABLES } from '@future/db/rls-tables'

// ─── helpers ─────────────────────────────────────────────────────────────────

async function checkRls(
  db: ReturnType<typeof createTestDb>,
  schema: string,
  table: string,
): Promise<{ relrowsecurity: boolean; relforcerowsecurity: boolean }> {
  const rows = (await db.execute(sql`
    SELECT c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${schema} AND c.relname = ${table}
  `)) as unknown as {
    rows: Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
  }
  if (rows.rows.length === 0) {
    throw new Error(`Table ${schema}.${table} not found in pg_class`)
  }
  return rows.rows[0]!
}

async function columnExists(
  db: ReturnType<typeof createTestDb>,
  schema: string,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = (await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = ${schema}
      AND table_name   = ${table}
      AND column_name  = ${column}
  `)) as unknown as { rows: Array<{ column_name: string }> }
  return rows.rows.length > 0
}

async function indexExists(
  db: ReturnType<typeof createTestDb>,
  schema: string,
  indexName: string,
): Promise<boolean> {
  const rows = (await db.execute(sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = ${schema} AND indexname = ${indexName}
  `)) as unknown as { rows: Array<{ indexname: string }> }
  return rows.rows.length > 0
}

async function uniqueConstraintExists(
  db: ReturnType<typeof createTestDb>,
  schema: string,
  indexName: string,
): Promise<boolean> {
  const rows = (await db.execute(sql`
    SELECT i.indisunique
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_index i ON i.indexrelid = c.oid
    WHERE n.nspname = ${schema} AND c.relname = ${indexName} AND i.indisunique = true
  `)) as unknown as { rows: Array<{ indisunique: boolean }> }
  return rows.rows.length > 0
}

/**
 * Query pg_policies for a specific policy on a given table+schema.
 * Returns the policy row (qual = USING expression, with_check = WITH CHECK expression).
 */
async function getPolicy(
  db: ReturnType<typeof createTestDb>,
  schema: string,
  table: string,
  policyName: string,
): Promise<{ qual: string | null; with_check: string | null } | null> {
  // Use the pg_policies system view (not pg_policy catalog) — it exposes
  // qual and with_check as human-readable text expressions.
  const rows = (await db.execute(sql`
    SELECT qual, with_check
    FROM pg_policies
    WHERE schemaname = ${schema}
      AND tablename  = ${table}
      AND policyname = ${policyName}
  `)) as unknown as {
    rows: Array<{ qual: string | null; with_check: string | null }>
  }
  return rows.rows[0] ?? null
}

// ─── setup ────────────────────────────────────────────────────────────────────

describe('Migration squash — P0 audit findings', () => {
  const db = createTestDb()

  beforeAll(async () => {
    await migrateForTest()
  })

  // ─── Sub-fix A: RLS on all tenant-scoped agents.* tables ──────────────────

  for (const table of AGENTS_TABLES) {
    it(`agents.${table}: RLS enabled and forced`, async () => {
      const row = await checkRls(db, 'agents', table)
      expect(row.relrowsecurity, `${table}.relrowsecurity`).toBe(true)
      expect(row.relforcerowsecurity, `${table}.relforcerowsecurity`).toBe(true)
    })
  }

  it('core.agent_delegation: RLS enabled and forced', async () => {
    const row = await checkRls(db, 'core', 'agent_delegation')
    expect(row.relrowsecurity, 'agent_delegation.relrowsecurity').toBe(true)
    expect(row.relforcerowsecurity, 'agent_delegation.relforcerowsecurity').toBe(true)
  })

  // ─── Sub-fix B: kernel audit_event columns ─────────────────────────────────

  it('core.audit_event has flow_id column', async () => {
    const exists = await columnExists(db, 'core', 'audit_event', 'flow_id')
    expect(exists).toBe(true)
  })

  it('core.audit_event has intent_slug column', async () => {
    const exists = await columnExists(db, 'core', 'audit_event', 'intent_slug')
    expect(exists).toBe(true)
  })

  it('core.audit_event flow_id has an index', async () => {
    const exists = await indexExists(db, 'core', 'audit_event_flow_id_idx')
    expect(exists).toBe(true)
  })

  it('core.audit_event intent_slug has an index', async () => {
    const exists = await indexExists(db, 'core', 'audit_event_intent_slug_idx')
    expect(exists).toBe(true)
  })

  // ─── Sub-fix C: GIN FTS index on agent_message ────────────────────────────

  it('agents.agent_message_fts_idx GIN index exists', async () => {
    const exists = await indexExists(db, 'agents', 'agent_message_fts_idx')
    expect(exists).toBe(true)
  })

  // ─── Sub-fix D: agent_tool_result_cache unique constraint ─────────────────

  it('agents.agent_tool_result_cache_exact_uidx unique index exists', async () => {
    const exists = await uniqueConstraintExists(db, 'agents', 'agent_tool_result_cache_exact_uidx')
    expect(exists).toBe(true)
  })

  // ─── Sub-fix E: pg_policies — verify CREATE POLICY executed (M-1) ─────────
  //
  // Spot-check 5 representative tables first, then loop all to ensure no table
  // was silently skipped.

  const REPRESENTATIVE_TABLES = [
    'agent_chat_session',
    'agent_message',
    'agent_tool_result_cache',
    'agent_session',
    'agent_cost_event',
  ] as const

  for (const table of REPRESENTATIVE_TABLES) {
    it(`agents.${table}: policy ${table}_tenant_isolation exists in pg_policies with current_setting`, async () => {
      const policy = await getPolicy(db, 'agents', table, `${table}_tenant_isolation`)
      expect(policy, `${table}: policy row in pg_policies`).not.toBeNull()
      // Assert the 2-arg form current_setting('app.tenant_id', true) is used.
      // The 'true' arg makes the call return NULL when unset instead of raising
      // an error — a regression to the 1-arg form would not be caught otherwise.
      expect(policy!.qual, `${table}: USING clause`).toContain('current_setting')
      expect(policy!.qual, `${table}: USING clause must use 2-arg current_setting`).toContain(
        ', true)',
      )
      expect(policy!.with_check, `${table}: WITH CHECK clause`).toContain('current_setting')
      expect(
        policy!.with_check,
        `${table}: WITH CHECK clause must use 2-arg current_setting`,
      ).toContain(', true)')
    })
  }

  it('all AGENTS_TABLES have a <table>_tenant_isolation policy in pg_policies', async () => {
    for (const table of AGENTS_TABLES) {
      const policyName = `${table}_tenant_isolation`
      const policy = await getPolicy(db, 'agents', table, policyName)
      expect(policy, `${table}: missing policy ${policyName}`).not.toBeNull()
      expect(policy!.qual, `${table}: USING clause must reference current_setting`).toContain(
        'current_setting',
      )
      // Verify 2-arg form — 'true' makes unset return NULL instead of erroring.
      expect(policy!.qual, `${table}: USING clause must use 2-arg current_setting`).toContain(
        ', true)',
      )
      expect(
        policy!.with_check,
        `${table}: WITH CHECK clause must reference current_setting`,
      ).toContain('current_setting')
      expect(
        policy!.with_check,
        `${table}: WITH CHECK clause must use 2-arg current_setting`,
      ).toContain(', true)')
    }
  })

  it('core.agent_delegation: policy agent_delegation_tenant_isolation exists in pg_policies', async () => {
    const policy = await getPolicy(
      db,
      'core',
      'agent_delegation',
      'agent_delegation_tenant_isolation',
    )
    expect(policy, 'agent_delegation: policy row in pg_policies').not.toBeNull()
    expect(policy!.qual, 'agent_delegation: USING clause').toContain('current_setting')
    expect(policy!.qual, 'agent_delegation: USING clause must use 2-arg current_setting').toContain(
      ', true)',
    )
    expect(policy!.with_check, 'agent_delegation: WITH CHECK clause').toContain('current_setting')
    expect(
      policy!.with_check,
      'agent_delegation: WITH CHECK clause must use 2-arg current_setting',
    ).toContain(', true)')
  })

  // ─── Sub-fix F: Unset tenant evaluates to empty result, not an error (C-1) ─
  //
  // With app.tenant_id NOT set, querying any RLS-protected table must return
  // 0 rows (the predicate is NULL != uuid = FALSE) rather than raising a hard
  // PostgreSQL ERROR like "unrecognized configuration parameter 'app.tenant_id'".

  it('agents.agent_chat_session: query with app.tenant_id unset returns 0 rows, no error', async () => {
    // Use a transaction to pin all statements to a single physical connection.
    // This avoids pool-reuse luck: SET LOCAL / RESET / SELECT all run inside
    // the same pg client, so the session variable state is deterministic.
    // We never call SET app.tenant_id here — testing the truly-never-set path.
    await db.transaction(async (tx) => {
      // Ensure the variable is unset for this connection (RESET is idempotent
      // when the variable was never set).
      await tx.execute(sql`RESET app.tenant_id`)

      // Querying should not throw — it should return an empty result set.
      const result = (await tx.execute(
        sql`SELECT * FROM agents.agent_chat_session LIMIT 1`,
      )) as unknown as { rows: unknown[] }

      expect(result.rows).toHaveLength(0)
    })
  })

  // ─── Sub-fix D-5: agent_write_dedup PRIMARY KEY uniqueness ────────────────

  it('agents.agent_write_dedup: idempotency_key column exists', async () => {
    expect(await columnExists(db, 'agents', 'agent_write_dedup', 'idempotency_key')).toBe(true)
  })

  it('agents.agent_write_dedup: idempotency_key PRIMARY KEY unique constraint exists', async () => {
    expect(await uniqueConstraintExists(db, 'agents', 'agent_write_dedup_pkey')).toBe(true)
  })
})
