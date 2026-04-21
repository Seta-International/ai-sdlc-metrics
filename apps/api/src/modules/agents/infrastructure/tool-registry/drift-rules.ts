/**
 * drift-rules.ts — build-time drift checker for agent tool procedures.
 *
 * Walks any tRPC router (intended for use against the real app router or
 * seeded fixture routers) and returns violations for four rules:
 *
 *   R-01.12 — required meta fields (whenToUse, whenNotToUse, examples)
 *   R-01.17 — example.callArgs parseable against the procedure's input schema
 *   R-01.18 — mutation procedures must declare approvalFreshness
 *   R-01.30 — input schema root shape must not contain tenant_id
 *
 * DEFERRED (not checked here — see plan 15):
 *   R-01.19  compositionSensitive on aggregate-returning tools — output-shape
 *            introspection is unreliable in tRPC v11; plan 15 will handle this
 *            once a stable output-schema contract exists.
 *   R-01.19a collectionContract on array-returning tools — same reason as
 *            R-01.19: array detection from tRPC v11 output shape is not safe
 *            at build time with the current router API.
 */

import type { AgentToolMeta } from '../../../../common/trpc/agent-tool-meta'
import { isZodObject, resolveRootSchema, hasSafeParse } from './zod-schema-utils'

// ─── Internal tRPC shape types ────────────────────────────────────────────────

interface ProcedureDef {
  type: 'query' | 'mutation' | 'subscription'
  meta?: {
    permission?: string
    agent?: AgentToolMeta
  }
  inputs: unknown[]
}

interface ProcedureLike {
  _def: ProcedureDef
}

interface RouterDef {
  procedures: Record<string, ProcedureLike>
}

interface RouterLike {
  _def: RouterDef
}

// ─── Violation shape ──────────────────────────────────────────────────────────

export interface DriftViolation {
  /** Dot-path name of the offending tRPC procedure, e.g. `planner.task.getBoard`. */
  toolName: string
  /** Rule identifier, e.g. `R-01.12`, `R-01.17`, `R-01.18`, `R-01.30`. */
  rule: string
  /** Human-readable description of the specific violation. */
  detail: string
}

// ─── Walker ───────────────────────────────────────────────────────────────────

/**
 * Walks every procedure in `router._def.procedures` that carries a
 * `.meta({ agent: {...} })` annotation and checks all four drift rules.
 *
 * Returns an array of `DriftViolation` objects — one entry per (tool, rule)
 * pair that is violated. An empty array means the router is clean.
 *
 * Pure function — no side effects, no exceptions.
 */
export function checkDriftRules(router: unknown): DriftViolation[] {
  const trpcRouter = router as RouterLike
  if (!trpcRouter?._def?.procedures) {
    return [
      {
        toolName: '<router>',
        rule: 'R-00',
        detail: 'router does not expose _def.procedures — expected a tRPC v11 AnyRouter',
      },
    ]
  }

  const violations: DriftViolation[] = []
  const procedures = trpcRouter._def.procedures

  for (const [name, proc] of Object.entries(procedures)) {
    const def = proc._def
    const meta = def.meta

    // Only check procedures with agent metadata
    if (!meta?.agent) {
      continue
    }

    const agent = meta.agent

    // ── R-01.12: required meta fields ────────────────────────────────────────

    if (!agent.whenToUse || agent.whenToUse.trim() === '') {
      violations.push({
        toolName: name,
        rule: 'R-01.12',
        detail: `[${name}] meta.agent.whenToUse is missing or empty`,
      })
    }

    if (!agent.whenNotToUse || agent.whenNotToUse.trim() === '') {
      violations.push({
        toolName: name,
        rule: 'R-01.12',
        detail: `[${name}] meta.agent.whenNotToUse is missing or empty`,
      })
    }

    if (!Array.isArray(agent.examples) || agent.examples.length === 0) {
      violations.push({
        toolName: name,
        rule: 'R-01.12',
        detail: `[${name}] meta.agent.examples must be an array with at least 1 entry`,
      })
    } else {
      agent.examples.forEach((ex, idx) => {
        if (!ex.input || ex.input.trim() === '') {
          violations.push({
            toolName: name,
            rule: 'R-01.12',
            detail: `[${name}] meta.agent.examples[${idx}].input is empty`,
          })
        }
        if (typeof ex.callArgs !== 'object' || ex.callArgs === null || Array.isArray(ex.callArgs)) {
          violations.push({
            toolName: name,
            rule: 'R-01.12',
            detail: `[${name}] meta.agent.examples[${idx}].callArgs must be a plain object`,
          })
        }
      })

      // ── R-01.17: example callArgs parseable by input schema ───────────────

      const inputs = def.inputs
      if (Array.isArray(inputs) && inputs.length > 0) {
        const inputSchema = inputs[0]
        if (hasSafeParse(inputSchema)) {
          agent.examples.forEach((ex, idx) => {
            if (
              typeof ex.callArgs !== 'object' ||
              ex.callArgs === null ||
              Array.isArray(ex.callArgs)
            ) {
              // Already reported above as R-01.12; skip here to avoid double-counting.
              return
            }
            const result = inputSchema.safeParse(ex.callArgs)
            if (!result.success) {
              violations.push({
                toolName: name,
                rule: 'R-01.17',
                detail: `[${name}] meta.agent.examples[${idx}].callArgs does not parse against the procedure's input schema (stale example or renamed field)`,
              })
            }
          })
        }
      }
    }

    // ── R-01.18: mutation must declare approvalFreshness ──────────────────────

    if (def.type === 'mutation' && agent.approvalFreshness === undefined) {
      violations.push({
        toolName: name,
        rule: 'R-01.18',
        detail: `[${name}] mutation procedures must declare meta.agent.approvalFreshness ('revalidate' | 'accept-stale')`,
      })
    }

    // ── R-01.30: tenant_id ban — shallow check on root Zod object ────────────

    const inputs = def.inputs
    if (Array.isArray(inputs) && inputs.length > 0) {
      const rootSchema = resolveRootSchema(inputs[0])
      if (isZodObject(rootSchema)) {
        if ('tenant_id' in rootSchema._def.shape) {
          violations.push({
            toolName: name,
            rule: 'R-01.30',
            detail: `[${name}] input schema must not contain tenant_id — tenant context is injected via RLS, not args`,
          })
        }
      }
    }
  }

  return violations
}
