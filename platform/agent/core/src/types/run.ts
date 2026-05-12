import type { KernelChunk } from './chunk'
import type { KernelMessage } from './message'

export type RunStatus = 'created' | 'running' | 'completed' | 'failed'

export interface Run {
  id: string
  status: RunStatus
  tenantId: string
  createdAt: Date
  finishedAt?: Date
}

export interface RunCtx {
  runId: string
  signal: AbortSignal
  retryCount: number
  now: () => number
  generateId: () => string
  currentDate: () => Date
}

export interface RunInput {
  messages: KernelMessage[]
  threadId?: string
  conversationId?: string
}

export interface StepResult {
  kind: 'model' | 'tool'
  chunks: KernelChunk[]
  message?: KernelMessage
}
