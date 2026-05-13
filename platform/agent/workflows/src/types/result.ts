import type { SerializedError } from '../schema'

export type RunResult<TOut> =
  | { status: 'completed'; runId: string; output: TOut }
  | { status: 'suspended'; runId: string; resumeLabel: string; stepId: string }
  | { status: 'failed'; runId: string; error: SerializedError }
  | { status: 'bailed'; runId: string; reason?: string }

export function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    const out: SerializedError = { name: err.name, message: err.message }
    if (err.stack) out.stack = err.stack
    if (err.cause !== undefined) out.cause = serializeError(err.cause)
    return out
  }
  return { name: 'NonError', message: String(err) }
}
