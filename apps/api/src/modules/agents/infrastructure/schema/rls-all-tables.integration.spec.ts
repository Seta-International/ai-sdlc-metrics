/**
 * Integration tests for migration squash — P0 audit findings.
 *
 * Verifies:
 *   A) RLS enabled + forced on every tenant-scoped agents.* table and
 *      core.agent_delegation
 *   B) kernel audit_event has flow_id and intent_slug columns (with indexes)
 *   C) agent_message_fts_idx GIN FTS index exists
 *   D) agent_tool_result_cache unique constraint exists
 */
import { sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, migrateForTest } from '@future/db/test-helpers'

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

// ─── setup ────────────────────────────────────────────────────────────────────

describe('Migration squash — P0 audit findings', () => {
  const db = createTestDb()

  beforeAll(async () => {
    await migrateForTest()
  })

  // ─── Sub-fix A: RLS on all tenant-scoped agents.* tables ──────────────────

  const AGENTS_TABLES_WITH_TENANT_ID = [
    'agent_chat_session',
    'agent_chat_message',
    'agent_insight',
    'agent_prompt_store',
    'agent_narrative_store',
    'agent_session',
    'agent_stored_sub_agent',
    'agent_conversation',
    'agent_message',
    'agent_l3_preference',
    'agent_scratchpad',
    'agent_tool_invocation',
    'agent_turn_sampling_decision',
    'agent_cost_event',
    'agent_tenant_budget',
    'agent_user_budget',
    'agent_rate_limit_counter',
    'agent_active_turn',
    'agent_golden_trace',
    'agent_canary_run',
    'agent_canary_query',
    'agent_rollout_config',
    'agent_rollout_event',
    'agent_shadow_run',
    'agent_tool_result_cache',
    'agent_draft',
    'agent_iteration',
    'agent_schedule',
    'agent_schedule_run',
    'agent_runbook_dry_run',
    'agent_p1_incident_log',
  ] as const

  for (const table of AGENTS_TABLES_WITH_TENANT_ID) {
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
})
