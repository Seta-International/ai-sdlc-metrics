import type { KernelMessage, MemoryContext, MemoryProvider, RecallResult } from '../types'

export class NullMemoryProvider implements MemoryProvider {
  async recall(_ctx: MemoryContext): Promise<RecallResult> {
    return { messages: [], total: 0, page: 1, perPage: 0, hasMore: false }
  }
  async saveTurn(_ctx: MemoryContext, _messages: KernelMessage[]): Promise<void> {}
  async getWorkingMemory(_ctx: MemoryContext): Promise<string | null> {
    return null
  }
  async updateWorkingMemory(_ctx: MemoryContext, _text: string): Promise<void> {}
}
