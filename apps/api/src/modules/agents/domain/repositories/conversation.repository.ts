import type { ConversationEntity } from '../entities/conversation.entity'

export interface ConversationRepository {
  loadOrCreateActive(opts: {
    tenantId: string
    userId: string
    surface: string
  }): Promise<{ conversation: ConversationEntity; isNew: boolean }>

  loadById(opts: { id: string; tenantId: string }): Promise<ConversationEntity | undefined>

  archive(opts: { id: string; tenantId: string }): Promise<void>

  delete(opts: { id: string; tenantId: string }): Promise<void>

  listGlobal(opts: {
    tenantId: string
    userId: string
    cursor?: string
    limit: number
  }): Promise<ConversationEntity[]>

  listBySurface(opts: {
    tenantId: string
    userId: string
    surface: string
  }): Promise<ConversationEntity[]>

  incrementSummaryFailureStreak(opts: { id: string; tenantId: string }): Promise<number>

  resetSummaryFailureStreak(opts: { id: string; tenantId: string }): Promise<void>

  setSummaryDisabled(opts: { id: string; tenantId: string; at: Date }): Promise<void>

  clearSummaryDisabled(opts: { id: string; tenantId: string }): Promise<void>

  updateTitle(opts: { id: string; tenantId: string; title: string }): Promise<void>

  touchLastUserTurn(opts: { id: string; tenantId: string; at: Date }): Promise<void>

  archiveIdleConversations(opts: {
    idleThresholdDays: number
    mode: 'archive' | 'hard_delete'
    tenantId: string
  }): Promise<number>
}

export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY')
