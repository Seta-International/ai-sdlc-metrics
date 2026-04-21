import type { ZodObject, ZodRawShape, z } from 'zod'

export class SchemaMismatchError extends Error {
  constructor(
    message: string,
    public readonly issues: unknown,
  ) {
    super(message)
    this.name = 'SchemaMismatchError'
  }
}

/**
 * Field-drop projection. Pure function. No transformation, coercion, or computation.
 *
 * Implements the §3 phase-handoff sanitization contract from the agent-runtime spec:
 * - Project phase-1 output into the target sub-agent's declared input schema.
 * - On any mismatch (missing key, wrong type), throw `SchemaMismatchError` — never coerce.
 * - Zero-key target returns `{}`.
 * - `null` / non-object input throws `SchemaMismatchError`.
 *
 * **Caveat for target schemas:** Zod constructs that rewrite values at parse time —
 * `.default(...)`, `.transform(...)`, `.catch(...)`, `.coerce.*` — bypass the "no
 * transformation" guarantee because `safeParse` will apply them. Callers must avoid
 * these constructs in target schemas. This is not enforced at runtime because walking
 * arbitrary Zod shapes for forbidden wrappers is a moving target across Zod versions.
 */
export function projectToSchema<TShape extends ZodRawShape>(
  input: Record<string, unknown>,
  target: ZodObject<TShape>,
): z.infer<ZodObject<TShape>> {
  if (input === null || typeof input !== 'object') {
    throw new SchemaMismatchError(`projectToSchema: input must be an object, got ${typeof input}`, {
      receivedType: typeof input,
      receivedValue: input,
    })
  }

  const picked: Record<string, unknown> = {}
  for (const key of Object.keys(target.shape)) {
    if (!(key in input)) {
      throw new SchemaMismatchError(`projectToSchema: target key "${key}" missing from input`, {
        missingKey: key,
      })
    }
    picked[key] = input[key]
  }

  const parsed = target.safeParse(picked)
  if (!parsed.success) {
    throw new SchemaMismatchError(
      'projectToSchema: target schema validation failed',
      parsed.error.issues,
    )
  }
  return parsed.data
}
