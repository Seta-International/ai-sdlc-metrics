/**
 * Shared Zod v4 schema introspection utilities.
 * Used by ToolRegistry (boot-time validation) and drift-rules (build-time drift checks)
 * to avoid duplicating pipe-unwrap logic.
 */

export interface ZodObjectDef {
  type: 'object'
  shape: Record<string, unknown>
}

export interface ZodObjectLike {
  _def: ZodObjectDef
}

/**
 * Returns true if `schema` is a Zod v4 object schema (has `_def.type === 'object'`
 * and a non-null `_def.shape`).
 */
export function isZodObject(schema: unknown): schema is ZodObjectLike {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    '_def' in schema &&
    (schema as ZodObjectLike)._def?.type === 'object' &&
    typeof (schema as ZodObjectLike)._def?.shape === 'object' &&
    (schema as ZodObjectLike)._def?.shape !== null
  )
}

/**
 * Unwraps a single level of Zod v4 pipe wrapper (produced by `.transform()` or `.pipe()`).
 * `_def.type === 'pipe'` means the "real" schema is at `_def.in`.
 * Returns the input unchanged for any other shape.
 *
 * Recursive — handles nested pipes.
 */
export function resolveRootSchema(schema: unknown): unknown {
  if (typeof schema === 'object' && schema !== null && '_def' in schema) {
    const def = (schema as { _def: { type?: string; in?: unknown } })._def
    if (def?.type === 'pipe' && 'in' in def) {
      return resolveRootSchema(def.in)
    }
  }
  return schema
}

/**
 * Returns a `safeParse` result-like object for any Zod schema.
 * Typed minimally; only `success` and `error` fields are used by callers.
 */
export interface SafeParseResultLike {
  success: boolean
  error?: unknown
}

/**
 * Returns true if `schema` exposes a `safeParse(data)` method.
 */
export function hasSafeParse(
  schema: unknown,
): schema is { safeParse: (data: unknown) => SafeParseResultLike } {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    'safeParse' in schema &&
    typeof (schema as { safeParse?: unknown }).safeParse === 'function'
  )
}
