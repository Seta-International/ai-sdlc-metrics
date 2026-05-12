import type { KernelMessage } from './message'

export interface MemoryContext {
  threadId: string
  conversationId?: string
  scope: 'thread' | 'resource'
  vectorSearchString?: string
}

export interface RecallResult {
  messages: KernelMessage[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
}

export interface MemoryProvider {
  recall(ctx: MemoryContext): Promise<RecallResult>
  saveTurn(ctx: MemoryContext, messages: KernelMessage[]): Promise<void>
  getWorkingMemory(ctx: MemoryContext): Promise<string | null>
  updateWorkingMemory(ctx: MemoryContext, text: string): Promise<void>
}
