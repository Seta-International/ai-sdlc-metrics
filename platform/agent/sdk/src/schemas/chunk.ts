import { z } from 'zod'

const Base = z.object({
  id: z.string(),
  runId: z.string(),
  ts: z.number(),
})

export const TextDeltaChunk = Base.extend({
  type: z.literal('text_delta'),
  delta: z.string(),
})

export const ToolCallChunk = Base.extend({
  type: z.literal('tool_call'),
  toolName: z.string(),
  input: z.unknown(),
})

export const ToolResultChunk = Base.extend({
  type: z.literal('tool_result'),
  toolCallId: z.string(),
  output: z.unknown(),
  durationMs: z.number(),
})

export const ModelCallStartChunk = Base.extend({
  type: z.literal('model_call_start'),
  model: z.string(),
})

export const ModelCallEndChunk = Base.extend({
  type: z.literal('model_call_end'),
  tokensIn: z.number(),
  tokensOut: z.number(),
  durationMs: z.number(),
})

export const RunStartChunk = Base.extend({ type: z.literal('run_start') })
export const RunEndChunk = Base.extend({ type: z.literal('run_end') })
export const RunErrorChunk = Base.extend({
  type: z.literal('run_error'),
  message: z.string(),
  code: z.string(),
})

export const KernelChunk = z.discriminatedUnion('type', [
  TextDeltaChunk,
  ToolCallChunk,
  ToolResultChunk,
  ModelCallStartChunk,
  ModelCallEndChunk,
  RunStartChunk,
  RunEndChunk,
  RunErrorChunk,
])

export type KernelChunk = z.infer<typeof KernelChunk>

export function parseChunk(raw: unknown): KernelChunk {
  return KernelChunk.parse(raw)
}
