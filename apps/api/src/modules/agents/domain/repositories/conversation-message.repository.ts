import type { ConversationMessageEntity } from '../entities/conversation-message.entity'

export interface ConversationMessageRepository {
  persist(opts: {
    conversationId: string
    tenantId: string
    message: Omit<ConversationMessageEntity, 'id' | 'createdAt'>
  }): Promise<ConversationMessageEntity>

  persistMany(opts: {
    conversationId: string
    tenantId: string
    messages: Array<Omit<ConversationMessageEntity, 'id' | 'createdAt'>>
  }): Promise<ConversationMessageEntity[]>

  listForWindow(opts: {
    conversationId: string
    tenantId: string
    limit: number
    before?: string
  }): Promise<ConversationMessageEntity[]>

  updateSummary(opts: { messageId: string; tenantId: string; summary: string }): Promise<void>

  hardDeleteContent(opts: { userId: string; tenantId: string }): Promise<{ count: number }>

  search(opts: {
    tenantId: string
    userId: string
    query: string
    limit: number
  }): Promise<ConversationMessageEntity[]>
}

export const CONVERSATION_MESSAGE_REPOSITORY = Symbol('CONVERSATION_MESSAGE_REPOSITORY')
