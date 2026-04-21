/**
 * Sub-agent type vocabulary — Plan 02.
 *
 * Pure TypeScript; zero NestJS / Drizzle dependencies.
 *
 * NOTE — Phase-1 output subset check (R-02.5):
 * The `projectToSchema()` function in application/ accepts any `ZodObject` as
 * the target schema and performs the subset projection at runtime. No canonical
 * "phase-1 output" Zod schema exists as a typed artifact — the output shape
 * varies per tool call (each tool has its own return type). Therefore the
 * compile-time subset constraint described in R-02.5 is NOT IMPLEMENTABLE with
 * the current Plan 01 artifacts. The `inputSchema` field is typed as
 * `TInputSchema extends ZodType` which gives per-call type safety but cannot
 * enforce the subset relationship at the `defineSubAgent` call site.
 *
 * ESCALATION NOTE: if a future plan introduces a canonical phase-1 envelope
 * schema (e.g. a shared `GatewayPhase1Output` Zod object), the subset check
 * can be added to `defineSubAgent`'s type signature using:
 *   `z.infer<TInputSchema> extends z.infer<typeof GatewayPhase1Output> ? ...`
 */

import type { ZodType } from 'zod'

// ─── Memory levels ─────────────────────────────────────────────────────────────

export type MemoryReadLevel = 'L1' | 'L2' | 'L3' | 'L4'

/**
 * Explicit alias — L4 is intentionally excluded.
 * L4 is a read-only global corpus; sub-agents must not write to it.
 */
export type MemoryWriteLevel = 'L1' | 'L2' | 'L3'

// ─── Branded key ───────────────────────────────────────────────────────────────

/**
 * Branded string for sub-agent registry keys.
 * `defineSubAgent` accepts a plain `string` and returns a config whose `key`
 * field is `SubAgentKey`, preventing accidental construction elsewhere.
 */
export type SubAgentKey = string & { readonly __brand: 'SubAgentKey' }

// ─── Model selection ───────────────────────────────────────────────────────────

/**
 * Minimal model selector. Kept thin per spec — richer model config can extend
 * this in a future plan.
 */
export type ModelChoice = {
  readonly provider: 'openai' | 'anthropic'
  readonly model: string
}

/**
 * Context available when a `DynamicArgument` function is resolved at session
 * start. Distinct from the gateway-layer `RequestContext` which lives in
 * application/. This context travels the domain layer only.
 */
export type TenantContext = {
  readonly tenantId: string
  readonly roleId?: string
  /** Surface from which the agent session was initiated. */
  readonly surface: 'global-chat' | 'inline' | 'async'
}

/**
 * Vercel-AI-SDK-style dynamic argument: a static value or a resolver function
 * evaluated at session start. Never evaluated inside `defineSubAgent`.
 */
export type DynamicArgument<T, Ctx> = T | ((ctx: Ctx) => T)

// ─── Validated config ─────────────────────────────────────────────────────────

/**
 * The return type of `defineSubAgent`. Consumers (SubAgentRegistry, RouterPromptBuilder,
 * etc.) accept only `ValidatedSubAgentConfig`, never the raw input shape, so that
 * construction-time validation is enforced at every usage site.
 */
export interface ValidatedSubAgentConfig<
  TInputSchema extends ZodType = ZodType,
  TOutputSchema extends ZodType = ZodType,
> {
  /** Domain-dot-name format key, e.g. `planner.read-only`. Branded to prevent accidental construction. */
  readonly key: SubAgentKey
  readonly domain: string
  readonly description: string
  readonly whenToUse: string
  readonly promptTemplate: {
    readonly body: string
    readonly variables: ZodType
  }
  readonly inputSchema: TInputSchema
  readonly outputSchema: TOutputSchema
  readonly toolScope: ReadonlyArray<string>
  readonly budgets: {
    readonly maxIterations: number
    readonly wallclockMs: number
    readonly costUsd: number
    readonly toolCeilingBytes?: number
  }
  readonly memoryScope: {
    readonly reads: ReadonlyArray<MemoryReadLevel>
    readonly writes: ReadonlyArray<MemoryWriteLevel>
  }
  readonly model: DynamicArgument<ModelChoice, TenantContext>
  readonly source: 'code' | 'stored'
  readonly toolRetrieval?: {
    readonly enabled: boolean
    readonly topK: number
  }
  readonly coreTools?: ReadonlyArray<string>
}
