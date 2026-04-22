export interface ConversationMessageContent {
  text?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: unknown
  [key: string]: unknown
}

export interface ConversationMessageEntity {
  id: string
  conversationId: string
  tenantId: string
  userId: string
  role: 'user' | 'assistant' | 'system'
  content: ConversationMessageContent | null
  summary: string | null
  traceId: string
  createdAt: Date
}
