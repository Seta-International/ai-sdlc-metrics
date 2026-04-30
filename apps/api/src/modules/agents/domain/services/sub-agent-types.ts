/**
 * Sub-agent type vocabulary.
 *
 * Pure TypeScript; zero NestJS / Drizzle dependencies.
 *
 * Phase-1 output subset check:
 * The canonical phase-1 output schema is defined in
 * `domain/value-objects/phase1-output-schema.ts` as `Phase1OutputSchema`
 * (MVP: `{ utterance: string }`). The subset check is enforced at compile time
 * via `AssertSubsetOfPhase1<TInputSchema>` in `sub-agent-factory.ts`:
 * any `defineSubAgent` call whose `inputSchema` does not include `utterance`
 * as a required field produces a `tsc` error at the call site.
 *
 * Runtime drift check:
 * `sub-agent-registry.spec.ts` contains a CI-breaking test that iterates all
 * booted sub-agents and parses `{ utterance: 'hello world' }` against each
 * inputSchema — ensuring no drift between compile-time constraint and runtime.
 */

import type { ZodType } from 'zod'

export type MemoryReadLevel = 'L1' | 'L2' | 'L3' | 'L4'

/**
 * Explicit alias — L4 is intentionally excluded.
 * L4 is a read-only global corpus; sub-agents must not write to it.
 */
export type MemoryWriteLevel = 'L1' | 'L2' | 'L3'

/**
 * Branded string for sub-agent registry keys.
 * `defineSubAgent` accepts a plain `string` and returns a config whose `key`
 * field is `SubAgentKey`, preventing accidental construction elsewhere.
 */
export type SubAgentKey = string & { readonly __brand: 'SubAgentKey' }

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
