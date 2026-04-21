/**
 * Plan 02 — Stored sub-agent port (Beta stub).
 *
 * The read path (`findActiveByKey`) is real; write path is deliberately not
 * exposed until Beta. At MVP the table is empty by construction, so the
 * method returns `null` for all lookups. When writes are enabled, behavior
 * flips naturally without any caller-side changes.
 *
 * `config` is typed as `unknown` here — it will be narrowed to
 * `ValidatedSubAgentConfig` by Task 2's schema work.
 */
export interface StoredSubAgentEntry {
  id: string
  tenantId: string
  key: string
  config: unknown
  version: number
  status: 'draft' | 'active' | 'retired'
  createdBy: string
  createdAt: Date
}

export interface StoredSubAgentPort {
  /**
   * Return the active stored sub-agent with the given key for this tenant,
   * or `null` when none exists.
   */
  findActiveByKey(opts: { tenantId: string; key: string }): Promise<StoredSubAgentEntry | null>
}

export const STORED_SUB_AGENT_PORT = Symbol('STORED_SUB_AGENT_PORT')
