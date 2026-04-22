import { describe, expect, it } from 'vitest'
import { createDb } from '@future/db'
import { MIGRATIONS_DIR } from '@future/db/test-helpers'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

function buildDatabaseUrl(databaseName: string): string {
  const baseUrl = process.env['TEST_DATABASE_URL']
  if (!baseUrl) {
    throw new Error('TEST_DATABASE_URL is required')
  }

  const url = new URL(baseUrl)
  url.pathname = `/${databaseName}`
  return url.toString()
}

function buildAdminUrl(): string {
  const baseUrl = process.env['TEST_DATABASE_URL']
  if (!baseUrl) {
    throw new Error('TEST_DATABASE_URL is required')
  }

  const url = new URL(baseUrl)
  url.pathname = '/postgres'
  return url.toString()
}

function buildTempDatabaseName(): string {
  return `future_test_bootstrap_${Date.now()}_${Math.floor(Math.random() * 100000)}`
}

describe('fresh migrations', () => {
  it('enable and force RLS on protected tables and create the supporting role grant index', async () => {
    const databaseName = buildTempDatabaseName()
    const adminDb = createDb(buildAdminUrl())

    try {
      await adminDb.execute(sql.raw(`CREATE DATABASE "${databaseName}"`))

      const targetDb = createDb(buildDatabaseUrl(databaseName))

      try {
        await migrate(targetDb, { migrationsFolder: MIGRATIONS_DIR })

        const rlsRows = await targetDb.execute<{
          table_name: string
          relrowsecurity: boolean
          relforcerowsecurity: boolean
        }>(sql`
          SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
          FROM pg_class c
          INNER JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'core'
            AND c.relname IN ('actor', 'user_identity', 'role_grant', 'department')
          ORDER BY c.relname
        `)

        expect(rlsRows.rows).toHaveLength(4)
        expect(rlsRows.rows).toEqual([
          { table_name: 'actor', relrowsecurity: true, relforcerowsecurity: true },
          { table_name: 'department', relrowsecurity: true, relforcerowsecurity: true },
          { table_name: 'role_grant', relrowsecurity: true, relforcerowsecurity: true },
          { table_name: 'user_identity', relrowsecurity: true, relforcerowsecurity: true },
        ])

        // agents schema tables that must have RLS — prevents drizzle-kit
        // regenerations from silently dropping hand-written RLS policies.
        const agentsRlsRows = await targetDb.execute<{
          table_name: string
          relrowsecurity: boolean
          relforcerowsecurity: boolean
        }>(sql`
          SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
          FROM pg_class c
          INNER JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'agents'
            AND c.relname IN ('agent_session', 'agent_stored_sub_agent')
          ORDER BY c.relname
        `)

        expect(agentsRlsRows.rows).toHaveLength(2)
        expect(agentsRlsRows.rows).toEqual([
          { table_name: 'agent_session', relrowsecurity: true, relforcerowsecurity: true },
          { table_name: 'agent_stored_sub_agent', relrowsecurity: true, relforcerowsecurity: true },
        ])

        const indexRows = await targetDb.execute<{ indexname: string }>(sql`
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'core'
            AND tablename = 'role_grant'
            AND indexname = 'idx_role_grant_actor'
        `)

        expect(indexRows.rows).toEqual([{ indexname: 'idx_role_grant_actor' }])
      } finally {
        await targetDb.$client.end()
      }
    } finally {
      await adminDb.execute(sql`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = ${databaseName}
          AND pid <> pg_backend_pid()
      `)
      await adminDb.execute(sql.raw(`DROP DATABASE IF EXISTS "${databaseName}"`))
      await adminDb.$client.end()
    }
  })
})
