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
 */
export interface TurnPolicy {
  readonly readOnly: boolean
}

/** Canonical read-only policy envelope used by the scheduled-turn worker. */
export const READ_ONLY_POLICY: TurnPolicy = Object.freeze({ readOnly: true })

/** Default policy for interactive turns — no additional restrictions. */
export const INTERACTIVE_POLICY: TurnPolicy = Object.freeze({ readOnly: false })
