import type { KernelError } from '../errors'

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
}

export type KernelChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_args'; toolCallId: string; argsDelta: string }
  | { type: 'tool_call'; toolCallId: string; name: string; args: unknown }
  | { type: 'finish'; reason: 'stop' | 'tool_calls' | 'length' | 'error'; usage?: TokenUsage }
  | { type: 'error'; error: KernelError }
  | { type: 'abort' }
