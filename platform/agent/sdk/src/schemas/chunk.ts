import { z } from 'zod'

export const TokenUsage = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadInputTokens: z.number().optional(),
  cacheCreationInputTokens: z.number().optional(),
})
export type TokenUsage = z.infer<typeof TokenUsage>

export const KernelErrorPayload = z.object({
  id: z.string(),
  code: z.string(),
  domain: z.enum(['AGENT', 'LLM', 'TOOL', 'KERNEL']),
  category: z.enum(['USER', 'SYSTEM', 'THIRD_PARTY']),
  details: z.record(z.string(), z.unknown()).optional(),
  message: z.string(),
})
export type KernelErrorPayload = z.infer<typeof KernelErrorPayload>

export const TextChunk = z.object({
  type: z.literal('text'),
  delta: z.string(),
})

export const ToolArgsChunk = z.object({
  type: z.literal('tool_args'),
  toolCallId: z.string(),
  argsDelta: z.string(),
})

export const ToolCallChunk = z.object({
  type: z.literal('tool_call'),
  toolCallId: z.string(),
  name: z.string(),
  args: z.unknown(),
})

export const FinishChunk = z.object({
  type: z.literal('finish'),
  reason: z.enum(['stop', 'tool_calls', 'length', 'error']),
  usage: TokenUsage.optional(),
})

export const ErrorChunk = z.object({
  type: z.literal('error'),
  error: KernelErrorPayload,
})

export const AbortChunk = z.object({
  type: z.literal('abort'),
})

export const KernelChunk = z.discriminatedUnion('type', [
  TextChunk,
  ToolArgsChunk,
  ToolCallChunk,
  FinishChunk,
  ErrorChunk,
  AbortChunk,
])

export type KernelChunk = z.infer<typeof KernelChunk>

export function parseChunk(raw: unknown): KernelChunk {
  return KernelChunk.parse(raw)
}
