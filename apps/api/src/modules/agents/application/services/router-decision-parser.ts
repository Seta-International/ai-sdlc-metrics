/**
 * RouterDecisionParser — Plan 02 Task 9 (R-02.20..R-02.23a)
 *
 * Stateless parser that validates raw LLM output or an already-parsed RouterPlan
 * against the canonical Zod schema plus semantic registry checks.
 *
 * Two entry points:
 *   parseRaw(rawText)  — full pipeline: JSON parse → Zod → semantic checks.
 *                        Used when the LLM returned a raw text blob (e.g. when
 *                        generateObject threw or was skipped).
 *   parsePlan(plan)    — semantic-only pipeline: skips JSON + Zod steps.
 *                        Used after generateObject succeeds (plan is already
 *                        structurally valid) — only registry membership and
 *                        mutual-exclusivity rules are applied.
 *
 * No retry-count tracking. The parser is intentionally stateless — the
 * orchestrator (T10) decides when to call parse a second time.
 *
 * No string-repair (R-02.22). A malformed input is returned as `retry`; it is
 * the orchestrator's responsibility to reassemble the prompt and re-call the LLM.
 *
 * Escalation: the parser NEVER returns `{ kind: 'escalate' }` on its own.
 * Escalation is the orchestrator's state-machine concern (T10).
 */

import { Injectable, Inject } from '@nestjs/common'
import {
  RouterPlanSchema,
  ROUTER_PLAN_JSON_SCHEMA_PLACEHOLDER,
} from '../../domain/value-objects/router-plan-schema'
import type {
  RouterPlan,
  BoundedPlan,
  IterativePlan,
} from '../../domain/value-objects/router-plan-schema'
import {
  INTENT_REGISTRY,
  IntentRegistry,
} from '../../infrastructure/registry/intents/intent-registry'
import {
  SUB_AGENT_REGISTRY,
  SubAgentRegistry,
} from '../../infrastructure/registry/sub-agent-registry'
import { SCORER_REGISTRY, ScorerRegistry } from './scorer-registry'

// ─── DI token ─────────────────────────────────────────────────────────────────

export const ROUTER_DECISION_PARSER = Symbol('ROUTER_DECISION_PARSER')

// ─── Result type ──────────────────────────────────────────────────────────────

export type ParseResult =
  | { kind: 'ok'; plan: RouterPlan }
  | { kind: 'retry'; reason: string; schemaInjectedPrompt: string }

// ─── Schema injection template ────────────────────────────────────────────────

/**
 * Builds the `schemaInjectedPrompt` included in every `retry` result.
 *
 * The schema fragment is the live JSON Schema derived from RouterPlanSchema —
 * always in sync with the Zod definition. The `reason` is injected per-call
 * so the model understands exactly what went wrong.
 *
 * No markdown fences are used so the prompt itself is not confusable with
 * a fenced LLM output.
 */
function buildSchemaInjectedPrompt(reason: string): string {
  const schemaJson = JSON.stringify(ROUTER_PLAN_JSON_SCHEMA_PLACEHOLDER, null, 2)
  return (
    `Your previous response did not match the required schema. Here is the schema again:\n` +
    `${schemaJson}\n\n` +
    `Reason the last output failed: ${reason}\n\n` +
    `Emit only a JSON object matching this schema. No markdown fences, no prose before or after.`
  )
}

// ─── RouterDecisionParser ─────────────────────────────────────────────────────

@Injectable()
export class RouterDecisionParser {
  constructor(
    @Inject(INTENT_REGISTRY) private readonly intentRegistry: IntentRegistry,
    @Inject(SUB_AGENT_REGISTRY) private readonly subAgentRegistry: SubAgentRegistry,
    @Inject(SCORER_REGISTRY) private readonly scorerRegistry: ScorerRegistry,
  ) {}

  // ─── Full pipeline ────────────────────────────────────────────────────────

  /**
   * Full parse pipeline: JSON parse → Zod validation → semantic checks.
   *
   * Use this when the LLM returned a raw text string (e.g. when generateObject
   * threw, or when the orchestrator is feeding a raw retry response).
   *
   * Returns `{ kind: 'ok', plan }` on success.
   * Returns `{ kind: 'retry', reason, schemaInjectedPrompt }` on any failure.
   * Never returns `{ kind: 'escalate' }` — that is the orchestrator's concern.
   */
  parseRaw(rawLlmOutput: string): ParseResult {
    // Step 1: JSON parse
    let parsed: unknown
    try {
      parsed = JSON.parse(rawLlmOutput)
    } catch {
      const reason = 'malformed JSON — the response could not be parsed as JSON'
      return { kind: 'retry', reason, schemaInjectedPrompt: buildSchemaInjectedPrompt(reason) }
    }

    // Step 2: Zod validation
    const zodResult = RouterPlanSchema.safeParse(parsed)
    if (!zodResult.success) {
      const reason = `schema validation failed — ${formatZodError(zodResult.error)}`
      return { kind: 'retry', reason, schemaInjectedPrompt: buildSchemaInjectedPrompt(reason) }
    }

    // Step 3: Semantic checks
    return this._semanticCheck(zodResult.data)
  }

  /**
   * Semantic-only pipeline: runs registry membership and mutual-exclusivity
   * checks on an already-parsed, Zod-valid RouterPlan.
   *
   * Use this after `generateObject` succeeds to avoid re-running JSON + Zod
   * validation on data that is already structurally valid.
   *
   * Returns `{ kind: 'ok', plan }` on success.
   * Returns `{ kind: 'retry', reason, schemaInjectedPrompt }` on semantic failure.
   */
  parsePlan(plan: RouterPlan): ParseResult {
    return this._semanticCheck(plan)
  }

  // ─── Semantic checks ──────────────────────────────────────────────────────

  /**
   * Applies semantic validation rules to a Zod-valid RouterPlan.
   *
   * For `direct` and `iterative` topologies: only intent_slug format is checked;
   * deeper semantic checks live in Plan 01 (direct) and Plan 12 (iterative).
   *
   * For `bounded` topology:
   *   1. intent_slug must be in IntentRegistry (or be 'unclassified').
   *   2. phase1[*].sub_agent_key must be in SubAgentRegistry.
   *   3. phase2[*].sub_agent_key (each entry) must be in SubAgentRegistry.
   *   4. Mutual exclusivity: disambiguation XOR (phase1 non-empty | phase2 non-empty).
   *      - If disambiguation is set: phase1 must be empty AND phase2 must be empty.
   *      - If disambiguation is absent: phase1 must have at least 1 directive.
   */
  private _semanticCheck(plan: RouterPlan): ParseResult {
    // Iterative topology: validate completionCriteria.scorerIds (Plan 12 R-12.10)
    if (plan.topology === 'iterative') {
      return this._semanticCheckIterative(plan as IterativePlan)
    }

    // Direct topology: accept after Zod structural validation
    if (plan.topology !== 'bounded') {
      return { kind: 'ok', plan }
    }

    const bounded = plan as BoundedPlan

    // Check 1: intent_slug in registry
    if (!this.intentRegistry.has(bounded.intent_slug)) {
      const reason =
        `intent_slug "${bounded.intent_slug}" is not registered in the IntentRegistry. ` +
        `Registered slugs: ${this.intentRegistry
          .list()
          .map((i) => i.slug)
          .join(', ')}`
      return { kind: 'retry', reason, schemaInjectedPrompt: buildSchemaInjectedPrompt(reason) }
    }

    // Check 2 + 3: sub_agent_key membership — phase1 and phase2 (now an array)
    const unknownKeys: string[] = []
    for (const directive of bounded.phase1) {
      if (!this.subAgentRegistry.has(directive.sub_agent_key)) {
        unknownKeys.push(directive.sub_agent_key)
      }
    }
    for (const directive of bounded.phase2) {
      if (!this.subAgentRegistry.has(directive.sub_agent_key)) {
        unknownKeys.push(directive.sub_agent_key)
      }
    }
    if (unknownKeys.length > 0) {
      const reason =
        `sub_agent_key(s) not registered in SubAgentRegistry: ${unknownKeys.join(', ')}. ` +
        `Registered keys: ${this.subAgentRegistry
          .list()
          .map((c) => c.key)
          .join(', ')}`
      return { kind: 'retry', reason, schemaInjectedPrompt: buildSchemaInjectedPrompt(reason) }
    }

    // Check 4a: mutual exclusivity — disambiguation present
    if (bounded.disambiguation !== undefined) {
      if (bounded.phase1.length > 0 || bounded.phase2.length > 0) {
        const reason =
          'mutual exclusivity violated — "disambiguation" cannot coexist with non-empty ' +
          '"phase1" or non-empty "phase2". When disambiguation is present, both arrays must be empty.'
        return { kind: 'retry', reason, schemaInjectedPrompt: buildSchemaInjectedPrompt(reason) }
      }
    }

    // Check 4b: mutual exclusivity — disambiguation absent → phase1 must be non-empty
    if (bounded.disambiguation === undefined && bounded.phase1.length === 0) {
      const reason =
        '"phase1" is empty and "disambiguation" is absent. ' +
        'Either provide at least one phase1 directive or set "disambiguation".'
      return { kind: 'retry', reason, schemaInjectedPrompt: buildSchemaInjectedPrompt(reason) }
    }

    return { kind: 'ok', plan }
  }

  // ─── Iterative-specific semantic checks ──────────────────────────────────────

  /**
   * Validates an IterativePlan's completionCriteria.scorerIds against the
   * ScorerRegistry (Plan 12 R-12.10).
   *
   * Rules:
   *   1. All scorer IDs must exist in the ScorerRegistry.
   *   2. All scorer IDs must reference a scorer with kind === 'deterministic'.
   *      Non-deterministic scorers (llm-judge) are prohibited as iterative exit gates.
   *
   * Unknown scorer → retry with "Unknown scorer: <id>"
   * Non-deterministic scorer → retry with "Scorer <id> is kind <kind>, only deterministic scorers
   *   allowed (plan 12 R-12.10)"
   */
  private _semanticCheckIterative(plan: IterativePlan): ParseResult {
    for (const scorerId of plan.completionCriteria.scorerIds) {
      const scorer = this.scorerRegistry.findById(scorerId)

      if (!scorer) {
        const reason = `Unknown scorer: ${scorerId}`
        return { kind: 'retry', reason, schemaInjectedPrompt: buildSchemaInjectedPrompt(reason) }
      }

      if (scorer.kind !== 'deterministic') {
        const reason =
          `Scorer ${scorerId} is kind ${scorer.kind}, only deterministic scorers allowed ` +
          `(plan 12 R-12.10)`
        return { kind: 'retry', reason, schemaInjectedPrompt: buildSchemaInjectedPrompt(reason) }
      }
    }

    return { kind: 'ok', plan }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats a Zod error into a concise human-readable string for use in the
 * `reason` field of a `retry` result.
 *
 * Only emits the first 3 issues to keep the prompt injection short.
 */
function formatZodError(error: import('zod').ZodError): string {
  const issues = error.issues.slice(0, 3)
  const formatted = issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '<root>'
      return `${path}: ${issue.message}`
    })
    .join('; ')
  const suffix = error.issues.length > 3 ? ` (+ ${error.issues.length - 3} more)` : ''
  return formatted + suffix
}
