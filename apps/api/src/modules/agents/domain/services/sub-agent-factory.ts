/**
 * defineSubAgent — typed factory for sub-agent configurations.
 *
 * Invariants captured at declaration site (not runtime discovery):
 *   - Required fields → compile error (missing required prop).
 *   - `memoryScope.writes` containing 'L4' → compile error via `MemoryWriteLevel`.
 *   - `toolScope` not `ReadonlyArray<string>` → compile error.
 *   - `budgets.maxIterations` outside [4, 5] → RangeError at call time.
 *   - `budgets.wallclockMs` / `budgets.costUsd` ≤ 0 → RangeError at call time.
 *   - `key` not matching domain-dot-name regex → RangeError at call time.
 *   - `promptTemplate.variables` not a Zod schema instance → RangeError at call time.
 *
 * The returned config is frozen at the top level, across all array fields, and
 * across nested plain-object fields (`budgets`, `memoryScope`, `promptTemplate`,
 * `toolRetrieval`). Zod schemas (`inputSchema`, `outputSchema`) and
 * function-valued `model` are deliberately not frozen because freezing Zod
 * internals can trigger stack overflow via cyclic `_def` references, and
 * function objects should not be frozen in place.
 *
 * Pure TypeScript — no NestJS, no Drizzle.
 */

import { ZodType } from 'zod'
import type { Phase1Output } from '../value-objects/phase1-output-schema'
import type {
  DynamicArgument,
  MemoryReadLevel,
  MemoryWriteLevel,
  ModelChoice,
  TenantContext,
  ValidatedSubAgentConfig,
} from './sub-agent-types'

export type {
  DynamicArgument,
  MemoryReadLevel,
  MemoryWriteLevel,
  ModelChoice,
  SubAgentKey,
  TenantContext,
  ValidatedSubAgentConfig,
} from './sub-agent-types'

/**
 * The sub-agent's inputSchema must accept (as REQUIRED fields) everything in
 * the canonical phase-1 output schema.
 *
 * The check uses `Phase1Output extends z.infer<TInputSchema>`:
 *   "The canonical phase-1 output object is assignable to the inputSchema's
 *    inferred type." This means a valid Phase1Output satisfies the schema —
 *    i.e., `utterance: string` (and any other phase-1 required fields) must be
 *    present in the inferred type.
 *
 * If the check fails, this helper resolves to a structural error type that is
 * not assignable to `TInputSchema`, producing a `tsc` error at the
 * `defineSubAgent` call site on the `inputSchema` property.
 */
type AssertSubsetOfPhase1<TInputSchema extends ZodType> =
  Phase1Output extends import('zod').infer<TInputSchema>
    ? TInputSchema
    : {
        __error: 'inputSchema missing required Phase1Output fields'
        __required: Phase1Output
      }

/**
 * Allowed key format: `<domain>.<name>` where each segment is a lowercase
 * alphanumeric identifier where hyphens may appear only between alphanumeric
 * segments (never trailing, never leading).
 * Examples: `planner.read-only`, `people.onboarding-helper`.
 * Rejected: `planner.read-only-`, `planner-.read-only`.
 */
const SUB_AGENT_KEY_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/**
 * Input accepted by `defineSubAgent`. The `key` is a plain `string` here; the
 * factory brands it into `SubAgentKey` in the returned config.
 *
 * `memoryScope.writes` is typed as `ReadonlyArray<MemoryWriteLevel>` which
 * excludes `'L4'` at the type level — passing `['L4']` is a compile error.
 */
interface SubAgentInput<TInputSchema extends ZodType, TOutputSchema extends ZodType> {
  readonly key: string
  readonly domain: string
  readonly description: string
  readonly whenToUse: string
  readonly promptTemplate: {
    readonly body: string
    readonly variables: ZodType
  }
  /**
   * Must accept all canonical Phase1Output fields as required.
   * `AssertSubsetOfPhase1<TInputSchema>` resolves to a structural error type
   * (not assignable to `TInputSchema`) when `utterance: string` is absent,
   * producing a compile error here at the call site.
   */
  readonly inputSchema: AssertSubsetOfPhase1<TInputSchema>
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
    /**
     * TYPE-FORBID L4: `MemoryWriteLevel` = 'L1' | 'L2' | 'L3'.
     * Passing 'L4' here is a compile-time error.
     */
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

function freezeArray<T>(arr: ReadonlyArray<T>): ReadonlyArray<T> {
  return Object.freeze([...arr])
}

/**
 * Constructs a `ValidatedSubAgentConfig` from the given input.
 *
 * Boot-time validations (throw on violation):
 *   - `key` must match the domain-dot-name regex (no trailing hyphens)
 *   - `budgets.maxIterations` must be 4 or 5
 *   - `budgets.wallclockMs` must be > 0
 *   - `budgets.costUsd` must be > 0
 *   - `promptTemplate.variables` must be a `ZodType` instance
 *
 * The returned config is frozen at the top level, across all array fields, and
 * across nested plain-object fields (`budgets`, `memoryScope`, `promptTemplate`,
 * `toolRetrieval`). Zod schemas (`inputSchema`, `outputSchema`) and
 * function-valued `model` are deliberately not frozen because freezing Zod
 * internals can trigger stack overflow via cyclic `_def` references, and
 * function objects should not be frozen in place.
 * Attempting to mutate a frozen array in strict mode throws a TypeError.
 */
export function defineSubAgent<TInputSchema extends ZodType, TOutputSchema extends ZodType>(
  config: SubAgentInput<TInputSchema, TOutputSchema>,
): ValidatedSubAgentConfig<TInputSchema, TOutputSchema> {
  if (!SUB_AGENT_KEY_RE.test(config.key)) {
    throw new RangeError(
      `defineSubAgent: key "${config.key}" is invalid. ` +
        `Expected domain-dot-name format with no trailing or leading hyphens ` +
        `(e.g. "planner.read-only"). Got: "${config.key}"`,
    )
  }

  if (!(config.promptTemplate.variables instanceof ZodType)) {
    throw new RangeError(
      `defineSubAgent: promptTemplate.variables must be a Zod schema. Got: ${typeof config.promptTemplate.variables}`,
    )
  }

  const { maxIterations, wallclockMs, costUsd } = config.budgets

  if (maxIterations !== 4 && maxIterations !== 5) {
    throw new RangeError(
      `defineSubAgent: budgets.maxIterations must be 4 or 5. Got: ${maxIterations}`,
    )
  }

  if (wallclockMs <= 0) {
    throw new RangeError(`defineSubAgent: budgets.wallclockMs must be > 0. Got: ${wallclockMs}`)
  }

  if (costUsd <= 0) {
    throw new RangeError(`defineSubAgent: budgets.costUsd must be > 0. Got: ${costUsd}`)
  }

  // `config.inputSchema` is typed as `AssertSubsetOfPhase1<TInputSchema>` (which
  // resolves to `TInputSchema` when the constraint passes). The cast is safe:
  // the conditional type proves the constraint holds at the call site.
  const validated: ValidatedSubAgentConfig<TInputSchema, TOutputSchema> = Object.freeze({
    key: config.key as ValidatedSubAgentConfig['key'],
    domain: config.domain,
    description: config.description,
    whenToUse: config.whenToUse,
    promptTemplate: Object.freeze({
      body: config.promptTemplate.body,
      variables: config.promptTemplate.variables,
    }),
    inputSchema: config.inputSchema as TInputSchema,
    outputSchema: config.outputSchema,
    toolScope: freezeArray(config.toolScope),
    budgets: Object.freeze({
      maxIterations,
      wallclockMs,
      costUsd,
      ...(config.budgets.toolCeilingBytes !== undefined
        ? { toolCeilingBytes: config.budgets.toolCeilingBytes }
        : {}),
    }),
    memoryScope: Object.freeze({
      reads: freezeArray(config.memoryScope.reads),
      writes: freezeArray(config.memoryScope.writes),
    }),
    model: config.model,
    source: config.source,
    ...(config.toolRetrieval !== undefined
      ? { toolRetrieval: Object.freeze({ ...config.toolRetrieval }) }
      : {}),
    ...(config.coreTools !== undefined ? { coreTools: freezeArray(config.coreTools) } : {}),
  })

  return validated
}
