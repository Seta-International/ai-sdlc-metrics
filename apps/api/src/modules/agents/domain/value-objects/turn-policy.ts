/**
 * TurnPolicy — runtime gate applied per turn to control which tool categories
 * are permitted for direct dispatch.
 *
 * Plan 09 R-09.6a: async turns under the read-only envelope may not execute
 * mutation tools directly; any mutation intent is coerced into a draft-to-inbox
 * via plan 08 at the gateway boundary.
 *
 * readOnly: true  → gateway refuses any tool whose descriptor.procedure === 'mutation'.
 *                   The refusal emits a kernel audit event and ends the gateway step
 *                   with variant 'policy_violation'.
 * readOnly: false → no additional policy gate (normal interactive path).
 *
 * Plan 08 R-08.36: MVP write scope enforcement.
 * agentPeopleWritesEnabled: false (default) → gateway refuses any mutation tool whose
 *   domain prefix is 'people' (i.e. tool name starts with 'people.') with variant
 *   'policy_violation'. Enabled per-tenant when the flag 'feature.agent.people_writes'
 *   is turned on in admin module's tenant_module_toggle table.
 */
export interface TurnPolicy {
  readonly readOnly: boolean
  /**
   * Plan 08 R-08.36 — Whether `people.*` mutation tools are allowed for this turn.
   * Default: false (disabled at MVP). Enabled per-tenant via the
   * 'feature.agent.people_writes' module toggle.
   *
   * When false, any mutation tool whose name starts with 'people.' is refused
   * at the gateway boundary with variant 'policy_violation'.
   */
  readonly agentPeopleWritesEnabled: boolean
}

/** Canonical read-only policy envelope used by the scheduled-turn worker. */
export const READ_ONLY_POLICY: TurnPolicy = Object.freeze({
  readOnly: true,
  agentPeopleWritesEnabled: false,
})

/** Default policy for interactive turns — no additional restrictions. */
export const INTERACTIVE_POLICY: TurnPolicy = Object.freeze({
  readOnly: false,
  agentPeopleWritesEnabled: false,
})
