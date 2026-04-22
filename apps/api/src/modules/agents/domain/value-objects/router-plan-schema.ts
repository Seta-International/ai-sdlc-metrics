/**
 * RouterPlan Zod schema — canonical definition (Plan 02 §4 Task 9, Plan 03 §3 revision).
 *
 * Plan 03 revision (2026-04-22):
 *   - RouterPlan is now a discriminated union over `topology`:
 *       'direct'   — Tier 0 single-tool deterministic execution (Plan 03 §5 Tier 0)
 *       'bounded'  — Tier 1 phase-1 + optional phase-2 fan-out (Plan 02 §4, Plan 03 §5)
 *       'iterative'— Tier 2 supervisor loop (Plan 12; minimal placeholder here)
 *   - BoundedPlan.phase2 is now SubAgentDirective[] (0..3) instead of a single optional directive.
 *     Phase 2 fan-out allows up to 3 parallel sub-agents (Plan 03 §3 R-03.37).
 *   - Disambiguation remains a field inside BoundedPlan (not a separate topology).
 *     Mutual-exclusivity rule — if disambiguation is set, phase1 must be empty and phase2 empty —
 *     is enforced semantically by RouterDecisionParser, not at schema level.
 *
 * Disambiguation vs phase1 design note:
 *   `phase1` is min(0) at schema level to allow an empty array in the disambiguation path.
 *   The rule "if disambiguation absent then phase1 non-empty" is enforced in RouterDecisionParser.
 *
 * intent_slug note:
 *   `INTENT_SLUG_REGEX` validates FORMAT only. Full registry-membership check lives in
 *   RouterDecisionParser. The special fallback slug 'unclassified' is allowed explicitly.
 */

import * as z from 'zod'
import { INTENT_SLUG_REGEX } from '../../infrastructure/registry/intents/intent-registry'

// ─── SubAgentDirective ────────────────────────────────────────────────────────

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

// ─── DirectExecutionPlan (Tier 0) ─────────────────────────────────────────────

/**
 * Tier 0 plan — single tool call, zero sub-agents, zero synthesizer.
 * Tool must declare `directExecutable: true` in tool meta (Plan 03 §5, R-03.35).
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

// ─── BoundedPlan (Tier 1) ─────────────────────────────────────────────────────

/**
 * Tier 1 plan — phase-1 fan-out (1..3 sub-agents) + optional phase-2 fan-out (0..3).
 *
 * Phase-2 shape change (Plan 03 §3 R-03.37, R-03.38):
 *   `phase2` is now SubAgentDirective[] (min 0, max 3). An empty array means no phase 2.
 *   Each phase-2 sub-agent receives its own per-sub-agent sanitized input (not a shared
 *   global projection). Sanitizer runs once per phase-2 entry, not once globally.
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
   * Per R-03.37: max 3 enforced at schema level AND re-validated at phase-executor entry.
   */
  phase2: z.array(SubAgentDirectiveSchema).min(0).max(3),

  /**
   * Present only when the router cannot unambiguously match an intent.
   * Mutual exclusivity with non-empty phase1/phase2 enforced by RouterDecisionParser.
   */
  disambiguation: z.string().min(1).optional(),
})

export type BoundedPlan = z.infer<typeof BoundedPlanSchema>

// ─── IterativePlan (Tier 2, Plan 12) ──────────────────────────────────────────

/**
 * Tier 2 plan — iterative supervisor loop.
 * Shape is owned by Plan 12. This is a minimal placeholder that allows the
 * phase-executor to recognize and dispatch the topology; Plan 12 extends the shape.
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
})

export type IterativePlan = z.infer<typeof IterativePlanSchema>

// ─── RouterPlan discriminated union ───────────────────────────────────────────

export const RouterPlanSchema = z.discriminatedUnion('topology', [
  DirectExecutionPlanSchema,
  BoundedPlanSchema,
  IterativePlanSchema,
])

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
