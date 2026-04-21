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
 * - On any mismatch (missing key, wrong type), throw — never coerce.
 */
export function projectToSchema<TShape extends ZodRawShape>(
  input: Record<string, unknown>,
  target: ZodObject<TShape>,
): z.infer<ZodObject<TShape>> {
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
