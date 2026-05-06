export interface AgentMessageEntity {
  id: string
  sessionId: string
  tenantId: string
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string
  toolName: string | null
  toolArgs: Record<string, unknown> | null
  modelUsed: string | null
  tokensUsed: number | null
  isError: boolean
  supersededAt?: Date | null
  createdAt: Date
}
