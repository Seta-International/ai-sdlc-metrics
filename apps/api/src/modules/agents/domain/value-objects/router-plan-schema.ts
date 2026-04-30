/**
 * RouterPlan Zod schema — canonical definition.
 *
 * RouterPlan is a discriminated union over `topology`:
 *   'direct'    — Tier 0 single-tool deterministic execution
 *   'bounded'   — Tier 1 phase-1 + optional phase-2 fan-out
 *   'iterative' — Tier 2 supervisor loop
 *
 * BoundedPlan.phase2 is SubAgentDirective[] (0..3). Phase 2 fan-out allows up
 * to 3 parallel sub-agents.
 *
 * Disambiguation remains a field inside BoundedPlan (not a separate topology).
 * Mutual-exclusivity rule — if disambiguation is set, phase1 must be empty
 * and phase2 empty — is enforced semantically by RouterDecisionParser, not at
 * schema level.
 *
 * `phase1` is min(0) at schema level to allow an empty array in the
 * disambiguation path. The rule "if disambiguation absent then phase1
 * non-empty" is enforced in RouterDecisionParser.
 *
 * `INTENT_SLUG_REGEX` validates FORMAT only. Full registry-membership check
 * lives in RouterDecisionParser. The special fallback slug 'unclassified' is
 * allowed explicitly.
 */

import * as z from 'zod'
import { INTENT_SLUG_REGEX } from '../../infrastructure/registry/intents/intent-registry'

export const SubAgentDirectiveSchema = z.object({
  /**
   * Key identifying the sub-agent to dispatch.
   * Must be in SubAgentRegistry — validated by RouterDecisionParser at parse time.
   */
  sub_agent_key: z.string().min(1),
  /**
   * Input payload for the sub-agent. Validated against the sub-agent's inputSchema
   * at phase execution time.
   */
  input: z.record(z.string(), z.unknown()),
  /**
   * LLM's natural-language rationale for dispatching this sub-agent.
   * Used for observability, debugging, and audit.
   */
  reason: z.string().min(1),
})

export type SubAgentDirective = z.infer<typeof SubAgentDirectiveSchema>

/**
 * Tier 0 plan — single tool call, zero sub-agents, zero synthesizer.
 * Tool must declare `directExecutable: true` in tool meta.
 */
export const DirectExecutionPlanSchema = z.object({
  topology: z.literal('direct'),
  /** Tool to invoke directly. Must be in the Tier-0 allowlist (directExecutable: true). */
  toolName: z.string().min(1),
  /** Arguments forwarded verbatim to the tool gateway. */
  args: z.record(z.string(), z.unknown()),
  /** Router confidence (0..1). Checked against per-surface floor at phase-executor entry. */
  confidence: z.number().min(0).max(1),
  /** Classified intent slug. Same format rules as BoundedPlan.intent_slug. */
  intent_slug: z
    .string()
    .refine((slug) => slug === 'unclassified' || INTENT_SLUG_REGEX.test(slug), {
      message:
        'intent_slug must be "unclassified" or a valid domain.name slug ' +
        '(format: domain.name(.name)+, lowercase letters, digits, hyphens; dot-separated segments)',
    }),
  /** UUID correlation ID for distributed tracing. */
  flow_id: z.string().uuid(),
})

export type DirectExecutionPlan = z.infer<typeof DirectExecutionPlanSchema>

/**
 * Tier 1 plan — phase-1 fan-out (1..3 sub-agents) + optional phase-2 fan-out (0..3).
 *
 * `phase2` is SubAgentDirective[] (min 0, max 3). An empty array means no phase 2.
 * Each phase-2 sub-agent receives its own per-sub-agent sanitized input (not a
 * shared global projection). Sanitizer runs once per phase-2 entry, not once
 * globally.
 */
export const BoundedPlanSchema = z.object({
  topology: z.literal('bounded'),

  /**
   * Classified intent slug from the IntentRegistry.
   * Format: `domain.name(.name)+` — validated by INTENT_SLUG_REGEX.
   * The literal 'unclassified' is a special fallback that bypasses the regex.
   */
  intent_slug: z
    .string()
    .refine((slug) => slug === 'unclassified' || INTENT_SLUG_REGEX.test(slug), {
      message:
        'intent_slug must be "unclassified" or a valid domain.name slug ' +
        '(format: domain.name(.name)+, lowercase letters, digits, hyphens; dot-separated segments)',
    }),

  /** UUID correlation ID stamped on this plan for distributed tracing. */
  flow_id: z.string().uuid(),

  /**
   * First-pass sub-agent invocations (1..3 at runtime; 0 allowed at schema level
   * for the disambiguation path). Semantic non-empty rule enforced by RouterDecisionParser.
   */
  phase1: z.array(SubAgentDirectiveSchema).min(0).max(3),

  /**
   * Optional second-pass sub-agent invocations (0..3).
   * Empty array = no phase 2. Each entry is dispatched sequentially by the orchestrator
   * (audit events) and the phase executor owns actual fan-out scheduling.
   * Max 3 enforced at schema level AND re-validated at phase-executor entry.
   */
  phase2: z.array(SubAgentDirectiveSchema).min(0).max(3),

  /**
   * Present only when the router cannot unambiguously match an intent.
   * Mutual exclusivity with non-empty phase1/phase2 enforced by RouterDecisionParser.
   */
  disambiguation: z.string().min(1).optional(),
})

export type BoundedPlan = z.infer<typeof BoundedPlanSchema>

/**
 * Specifies the exit criteria for an iterative supervisor loop.
 *
 * `scorerIds` — references registered deterministic scorers.
 * `strategy`  — 'all' requires every scorer to pass; 'any' requires at least one.
 * `maxIterations` — upper bound on loop iterations. No schema-level cap; runtime
 *   enforces surface-specific limits (≤10 interactive, ≤20 async).
 * `hintToRouter` — prose description of "done" passed as context to the router
 *   on each re-entry to help it decide when to stop.
 */
export const CompletionSpecSchema = z.object({
  /** Non-empty list of scorer IDs from the scorer registry. */
  scorerIds: z.array(z.string().min(1)).min(1),
  /** Exit strategy: all scorers must pass ('all') or at least one ('any'). */
  strategy: z.enum(['all', 'any']),
  /**
   * Maximum number of loop iterations before forced termination.
   * No upper-bound validation at schema level — enforced at runtime by the orchestrator.
   */
  maxIterations: z.number().int().min(1),
  /** Natural-language description of what "done" means for this task. Passed to the router. */
  hintToRouter: z.string().min(1),
})

export type CompletionSpec = z.infer<typeof CompletionSpecSchema>

/**
 * Tier 2 plan — iterative supervisor loop.
 *
 * The router emits this plan when the intent requires repeated sub-agent
 * invocations with completion scoring between iterations.  The orchestrator
 * drives the loop: dispatch `initialDirective`, score the output via
 * `completionCriteria`, and re-route until criteria are met or `maxIterations`
 * is exhausted.
 *
 * `disambiguation` — optional clarifying question surfaced when the router
 * cannot unambiguously classify the intent.  Mutually exclusive with a fully
 * populated `initialDirective` (enforced semantically, not at schema level).
 */
export const IterativePlanSchema = z.object({
  topology: z.literal('iterative'),
  /** Classified intent slug. Same format rules as BoundedPlan (INTENT_SLUG_REGEX or 'unclassified'). */
  intent_slug: z
    .string()
    .refine((slug) => slug === 'unclassified' || INTENT_SLUG_REGEX.test(slug), {
      message:
        'intent_slug must be "unclassified" or a valid domain.name slug ' +
        '(format: domain.name(.name)+, lowercase letters, digits, hyphens; dot-separated segments)',
    }),
  /** UUID correlation ID for distributed tracing. */
  flow_id: z.string().uuid(),
  /** The first sub-agent to invoke at iteration 1. */
  initialDirective: SubAgentDirectiveSchema,
  /** Scoring + exit criteria for the supervisor loop. */
  completionCriteria: CompletionSpecSchema,
  /**
   * Optional clarifying question when the router cannot classify the intent.
   * When set, the orchestrator surfaces this to the user before starting the loop.
   */
  disambiguation: z.string().min(1).optional(),
})

export type IterativePlan = z.infer<typeof IterativePlanSchema>

export const RouterPlanSchema = z.discriminatedUnion('topology', [
  DirectExecutionPlanSchema,
  BoundedPlanSchema,
  IterativePlanSchema,
])

export type RouterPlan = z.infer<typeof RouterPlanSchema>

/**
 * Live JSON Schema derived from `RouterPlanSchema` via Zod v4's native
 * `z.toJSONSchema()`. Cached at module load time (pure, deterministic).
 *
 * Named `ROUTER_PLAN_JSON_SCHEMA_PLACEHOLDER` for import-path stability — this
 * is the canonical live schema, not a placeholder.
 */
export const ROUTER_PLAN_JSON_SCHEMA_PLACEHOLDER: Record<string, unknown> = z.toJSONSchema(
  RouterPlanSchema,
  { reused: 'inline' },
) as Record<string, unknown>
