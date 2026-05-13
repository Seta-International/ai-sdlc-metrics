export type KernelRole = 'system' | 'user' | 'assistant' | 'tool'

export type KernelMessageContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; toolCallId: string; name: string; args: unknown }
  | { type: 'tool_result'; toolCallId: string; result: unknown; isError?: boolean }

export interface KernelMessage {
  id?: string
  role: KernelRole
  content: KernelMessageContent[]
  toolCallId?: string
}
