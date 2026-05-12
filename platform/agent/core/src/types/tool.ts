import type { RunCtx } from './run'
import type { StandardSchemaV1 } from './schema'

export interface ToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
  requireApproval?: boolean
}

export type ToolExecutionContext =
  | { surface: 'teams'; abortSignal: AbortSignal; runId: string; requestContext: Readonly<RunCtx> }
  | { surface: 'direct'; abortSignal: AbortSignal; runId: string; requestContext: Readonly<RunCtx> }

export type ToolResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { name: string; message: string; details?: Record<string, unknown> } }
  | { suspend: { reason: string; resumeLabel: string } }

export interface Tool<TInput = unknown, TOutput = unknown> {
  id: string
  description: string
  inputSchema: StandardSchemaV1<TInput>
  outputSchema: StandardSchemaV1<TOutput>
  execute: (input: TInput, ctx: ToolExecutionContext) => Promise<ToolResult<TOutput>>
  annotations?: ToolAnnotations
  toModelOutput?: (out: TOutput) => unknown
}

export interface JsonSchemaTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}
