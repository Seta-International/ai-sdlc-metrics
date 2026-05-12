import type { Sql, TransactionSql } from 'postgres'
import postgres from 'postgres'

export type DbSql = Sql

export function createPool(
  url: string,
  opts?: Partial<postgres.Options<Record<string, postgres.PostgresType>>>,
): DbSql {
  return postgres(url, {
    max: 20,
    idle_timeout: 30,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
    prepare: false, // pgvector ops choke on prepared statements
    connection: { application_name: 'seta' },
    ...opts,
  })
}

/**
 * THE only entrypoint for tenant-scoped queries.
 * RLS depends on this — never run tenant-scoped SQL outside withTenant.
 */
export async function withTenant<T>(
  sql: DbSql,
  tenantId: string,
  fn: (tx: TransactionSql) => Promise<T>,
  userId?: string,
): Promise<T> {
  // sql.begin's return is Promise<UnwrapPromiseArray<T>>; for a non-array T this is T,
  // but the conditional won't reduce generically — cast at the boundary.
  return sql.begin(async (tx) => {
    // SET LOCAL doesn't accept bind parameters; set_config(..., is_local=true) is the parameterizable equivalent (tx-scoped).
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    if (userId) {
      await tx`SELECT set_config('app.user_id', ${userId}, true)`
    }
    return fn(tx)
  }) as Promise<T>
}
