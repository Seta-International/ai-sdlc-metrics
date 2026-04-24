import { uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { coreSchema } from './actor.schema'

/**
 * Plan 08 — Agent delegation record.
 *
 * Grants a specific agent delegate role the authority to act on behalf of a
 * user (or the whole tenant when delegator_user_id IS NULL) within the given
 * scope.  Created by the planner/scheduler at the start of an async flow and
 * referenced by every agent_draft row produced during that flow.
 *
 * Stored in the `core` schema alongside the existing human delegation table
 * because delegation authority is a kernel concern regardless of actor type.
 */
export const agentDelegation = coreSchema.table(
  'agent_delegation',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    /** RLS isolation column — required on every table. */
    tenantId: uuid('tenant_id').notNull(),
    /**
     * The human user on whose behalf the agent is acting.
     * NULL means tenant-wide delegation (Plan 09 scheduler use-case).
     */
    delegatorUserId: uuid('delegator_user_id'),
    /**
     * The agent role being delegated to.
     * Allowlisted values: 'agent:approval-executor' | 'agent:scheduler'
     */
    delegate: text('delegate').notNull(),
    /** Scope-specific payload — structure depends on the delegate role. */
    scope: jsonb('scope').notNull().default({}),
    /** Hard expiry — the delegation cannot be used after this timestamp. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Lifecycle state. Default 'active'; sweep job sets 'expired'. */
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('agent_delegation_tenant_delegator_status_idx').on(
      t.tenantId,
      t.delegatorUserId,
      t.status,
    ),
    index('agent_delegation_tenant_status_expires_idx').on(t.tenantId, t.status, t.expiresAt),
  ],
)

export type AgentDelegationRow = typeof agentDelegation.$inferSelect
export type NewAgentDelegationRow = typeof agentDelegation.$inferInsert
