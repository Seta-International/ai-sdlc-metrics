/**
 * RouterPlan Zod schema — canonical definition (Plan 02 §4, Task 9).
 *
 * This file replaces the Task-7 placeholder with a live Zod schema.
 * The `ROUTER_PLAN_JSON_SCHEMA_PLACEHOLDER` export is preserved under the
 * same name so the T7 RouterPromptBuilder import path remains stable.
 * It is now a live derivation via `z.toJSONSchema(RouterPlanSchema)` cached
 * at module load time.
 *
 * Disambiguation vs phase1 design note (Plan §4 vs §6 test item 8):
 *   The plan spec lists `phase1: SubAgentDirective[]` as non-optional with 1..3
 *   elements. However, when `disambiguation` is set the LLM cannot fill phase1,
 *   creating a structural contradiction. Resolution: `phase1` is `min(0).max(3)` in
 *   the Zod schema (allowing an empty array in the disambiguation path). The
 *   mutual-exclusivity rule — "if disambiguation is absent, phase1 must be
 *   non-empty; if disambiguation is present, phase1 and phase2 must be absent" —
 *   is enforced as a semantic check in `RouterDecisionParser.parse()`, not here.
 *   Rationale: the schema's job is structure, not cross-field business rules.
 *
 * intent_slug note:
 *   `INTENT_SLUG_REGEX` validates the slug FORMAT at schema level (e.g. no
 *   underscores, must have at least one dot, etc.). Full registry-membership
 *   validation (i.e. "is this slug registered?") is deferred to
 *   `RouterDecisionParser` which has runtime access to `IntentRegistry`. The
 *   special fallback slug `'unclassified'` does not match the regex but is a
 *   valid intent; the parser allows it explicitly.
 */

import { z } from 'zod'
import { INTENT_SLUG_REGEX } from '../../infrastructure/registry/intents/intent-registry'

// ─── SubAgentDirective ────────────────────────────────────────────────────────

export const SubAgentDirectiveSchema = z.object({
  /**
   * Key identifying the sub-agent to dispatch.
   * Must be in SubAgentRegistry — validated by RouterDecisionParser at parse time,
   * not at schema level (no runtime registry access here).
   */
  sub_agent_key: z.string().min(1),
  /**
   * Input payload for the sub-agent. Content is validated against the
   * sub-agent's own `inputSchema` at phase execution time (T10 scope).
   */
  input: z.record(z.string(), z.unknown()),
  /**
   * LLM's natural-language rationale for dispatching this sub-agent.
   * Used for observability, debugging, and audit.
   */
  reason: z.string().min(1),
})

export type SubAgentDirective = z.infer<typeof SubAgentDirectiveSchema>

// ─── RouterPlan ───────────────────────────────────────────────────────────────

export const RouterPlanSchema = z.object({
  /**
   * Execution topology. Only 'bounded' is supported at MVP.
   * The 'iterative' topology is deferred to Plan 12.
   */
  topology: z.literal('bounded'),

  /**
   * Classified intent slug from the IntentRegistry.
   * Format: `domain.name(.name)+` — validated by INTENT_SLUG_REGEX.
   * The literal 'unclassified' is a special fallback that bypasses the regex.
   * Full membership check against the live registry is done in RouterDecisionParser.
   *
   * Note: schema validates FORMAT only; registry membership is a semantic check.
   */
  intent_slug: z
    .string()
    .refine((slug) => slug === 'unclassified' || INTENT_SLUG_REGEX.test(slug), {
      message:
        'intent_slug must be "unclassified" or a valid domain.name slug ' +
        '(format: domain.name(.name)+, lowercase letters, digits, hyphens; dot-separated segments)',
    }),

  /**
   * UUID correlation ID stamped on this plan for distributed tracing.
   */
  flow_id: z.string().uuid(),

  /**
   * First-pass sub-agent invocations.
   * Allowed 0..3 at schema level; semantic rule "if !disambiguation then >= 1"
   * is enforced by RouterDecisionParser.
   * See module-level comment for the disambiguation vs phase1 design rationale.
   */
  phase1: z.array(SubAgentDirectiveSchema).min(0).max(3),

  /**
   * Optional second-pass sub-agent invocation (follow-up or parallel agent).
   * Present only when the first phase needs a subsequent step.
   */
  phase2: SubAgentDirectiveSchema.optional(),

  /**
   * Present only when the router cannot unambiguously match an intent.
   * Mutual exclusivity with phase1/phase2 is enforced by RouterDecisionParser
   * (not at schema level).
   */
  disambiguation: z.string().optional(),
}) satisfies z.ZodType<{
  topology: 'bounded'
  intent_slug: string
  flow_id: string
  phase1: SubAgentDirective[]
  phase2?: SubAgentDirective
  disambiguation?: string
}>

export type RouterPlan = z.infer<typeof RouterPlanSchema>

// ─── JSON Schema derivation ───────────────────────────────────────────────────

/**
 * Live JSON Schema derived from `RouterPlanSchema` via Zod v4's native
 * `z.toJSONSchema()`. Cached at module load time (pure, deterministic).
 *
 * Named `ROUTER_PLAN_JSON_SCHEMA_PLACEHOLDER` to keep the T7 import path stable.
 * The "PLACEHOLDER" suffix is preserved for backward-import-path compatibility —
 * this is now the canonical live schema, not a placeholder.
 */
export const ROUTER_PLAN_JSON_SCHEMA_PLACEHOLDER: Record<string, unknown> = z.toJSONSchema(
  RouterPlanSchema,
  { reused: 'inline' },
) as Record<string, unknown>
