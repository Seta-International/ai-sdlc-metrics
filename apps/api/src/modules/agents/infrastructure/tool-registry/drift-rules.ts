/**
 * drift-rules.ts — build-time drift checker for agent tool procedures.
 *
 * Walks any tRPC router (intended for use against the real app router or
 * seeded fixture routers) and returns violations for six rules:
 *
 *   R-01.12 — required meta fields (whenToUse, whenNotToUse, examples)
 *   R-01.17 — example.callArgs parseable against the procedure's input schema
 *   R-01.18 — mutation procedures must declare approvalFreshness
 *   R-01.19 — aggregate-returning tools must declare compositionSensitive.minGroupSize
 *   R-01.19a — array-returning tools must declare collectionContract
 *   R-01.30 — input schema root shape must not contain tenant_id
 *   R-14.2  — cacheable must not appear on mutation procedures
 */

import type { AgentToolMeta } from '../../../../common/trpc/agent-tool-meta'
import { isZodObject, resolveRootSchema, hasSafeParse } from './zod-schema-utils'

interface ProcedureDef {
  type: 'query' | 'mutation' | 'subscription'
  meta?: {
    permission?: string
    agent?: AgentToolMeta
  }
  inputs: unknown[]
  output?: unknown
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

export interface DriftViolation {
  /** Dot-path name of the offending tRPC procedure, e.g. `planner.task.getBoard`. */
  toolName: string
  /** Rule identifier, e.g. `R-01.12`, `R-01.17`, `R-01.18`, `R-01.19`, `R-01.19a`, `R-01.30`, `R-14.2`. */
  rule: string
  /** Human-readable description of the specific violation. */
  detail: string
}

const AGGREGATE_KEYS = new Set([
  'average',
  'avg',
  'count',
  'counts',
  'max',
  'min',
  'sum',
  'total',
  'totals',
])

function zodType(schema: unknown): string | undefined {
  if (typeof schema !== 'object' || schema === null || !('_def' in schema)) {
    return undefined
  }
  return (schema as { _def?: { type?: string } })._def?.type
}

function resolveOutputSchema(schema: unknown): unknown {
  const rootSchema = resolveRootSchema(schema)
  if (typeof rootSchema !== 'object' || rootSchema === null || !('_def' in rootSchema)) {
    return rootSchema
  }

  const def = (rootSchema as { _def?: { innerType?: unknown } })._def
  if (def && 'innerType' in def) {
    return resolveOutputSchema(def.innerType)
  }

  return rootSchema
}

function isZodArray(schema: unknown): boolean {
  return zodType(schema) === 'array'
}

function isZodNumber(schema: unknown): boolean {
  return zodType(schema) === 'number'
}

function objectShape(schema: unknown): Record<string, unknown> | undefined {
  const rootSchema = resolveOutputSchema(schema)
  if (!isZodObject(rootSchema)) {
    return undefined
  }
  return rootSchema._def.shape
}

function hasTopLevelCollection(outputSchema: unknown): boolean {
  const rootSchema = resolveOutputSchema(outputSchema)
  if (isZodArray(rootSchema)) {
    return true
  }

  const shape = objectShape(rootSchema)
  if (!shape) {
    return false
  }

  return Object.values(shape).some((value) => isZodArray(resolveOutputSchema(value)))
}

function isAggregateOutput(outputSchema: unknown): boolean {
  const shape = objectShape(outputSchema)
  if (!shape) {
    return false
  }

  return Object.entries(shape).some(
    ([key, value]) => AGGREGATE_KEYS.has(key) && isZodNumber(resolveOutputSchema(value)),
  )
}

/**
 * Walks every procedure in `router._def.procedures` that carries a
 * `.meta({ agent: {...} })` annotation and checks all drift rules.
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

    // ── R-01.19: aggregate outputs must declare composition sensitivity ──────

    const outputSchema = def.output
    if (
      outputSchema !== undefined &&
      isAggregateOutput(outputSchema) &&
      typeof agent.compositionSensitive?.minGroupSize !== 'number'
    ) {
      violations.push({
        toolName: name,
        rule: 'R-01.19',
        detail: `[${name}] aggregate-returning tools must declare meta.agent.compositionSensitive.minGroupSize`,
      })
    }

    // ── R-01.19a: array outputs must declare collection contract ─────────────

    if (
      outputSchema !== undefined &&
      hasTopLevelCollection(outputSchema) &&
      agent.collectionContract === undefined
    ) {
      violations.push({
        toolName: name,
        rule: 'R-01.19a',
        detail: `[${name}] array-returning tools must declare meta.agent.collectionContract`,
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

    // ── R-14.2: cacheable must not appear on mutation procedures ─────────────

    if (def.type === 'mutation' && agent.cacheable !== undefined) {
      violations.push({
        toolName: name,
        rule: 'R-14.2',
        detail: `[${name}] cacheable must not appear on mutation procedures — caching write results is forbidden`,
      })
    }
  }

  return violations
}
