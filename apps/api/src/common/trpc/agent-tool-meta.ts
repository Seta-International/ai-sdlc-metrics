/**
 * AgentToolMeta — shape of the `.meta({ agent: {...} })` block on tRPC procedures.
 * Per plan 01 §3. Lives in code only; no DB persistence.
 *
 * Lives in common/trpc/ because these types are part of the tRPC metadata contract —
 * they exist solely because tRPC procedures carry `.meta({ agent: {...} })`.
 * Modules consume this type; common/trpc does not depend on any module.
 */
export interface AgentToolMeta {
  /** Required. Router decision hint — shown inline in the router prompt. */
  readonly whenToUse: string
  /** Required. Negative examples for the router. */
  readonly whenNotToUse: string
  /**
   * Required, ≥1 entry at runtime (not enforced by types alone).
   * Grounds the model in expected usage.
   */
  readonly examples: ReadonlyArray<{
    readonly input: string
    readonly callArgs: Record<string, unknown>
  }>
  /**
   * Optional. Field names whose content is user-authored.
   * Triggers taint flip + delimiter wrap + Langfuse redaction.
   */
  readonly tenantAuthoredFreeText?: ReadonlyArray<string>
  /**
   * Must be set on `.mutation()` procedures exposed as agent tools — validated at registry
   * boot time (Task 2). Drives §10 revalidation contract.
   */
  readonly approvalFreshness?: 'revalidate' | 'accept-stale'
  /** Optional, default 72h. Per-tool override for draft expiry. */
  readonly approvalTtl?: string
  /**
   * Required on aggregate-returning tools.
   * Author-time k-anonymity declaration.
   */
  readonly compositionSensitive?: { readonly minGroupSize: number }
  /** Optional; required on escape-hatch + bulk tools. */
  readonly ceilings?: {
    readonly bytesScanned?: number
    readonly wallclockMs?: number
  }
  /**
   * Required when output schema is an array or carries a collection under a well-known key.
   * Pagination is a contract, not a convention.
   */
  readonly collectionContract?: {
    readonly pageSize: number
    readonly cursorStyle: 'forward' | 'bidirectional'
  }
  /**
   * Optional on scalar-returning tools whose full row shape may exceed `bytesScanned`.
   * Declares which fields the model receives by default.
   */
  readonly projection?: {
    readonly requiredFields: ReadonlyArray<string>
    readonly optionalFields?: ReadonlyArray<string>
  }
}

/**
 * AgentToolDescriptor — the registry entry for a single agent-exposed tRPC procedure.
 * Produced by ToolRegistry (Task 2) from the tRPC router's procedure metadata.
 */
export interface AgentToolDescriptor {
  readonly name: string
  readonly procedure: 'query' | 'mutation'
  readonly permission: string
  /** JsonSchema — kept as `unknown` at MVP; a typed JsonSchema export can land in Task 2. */
  readonly inputSchema: unknown
  /** JsonSchema — kept as `unknown` at MVP; a typed JsonSchema export can land in Task 2. */
  readonly outputSchema: unknown
  readonly meta: AgentToolMeta
}
