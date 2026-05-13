import { AgentError } from '@seta/agent-core'

export class WorkingMemoryTooLargeError extends AgentError {
  constructor(bytes: number) {
    super({
      code: 'WORKING_MEMORY_TOO_LARGE',
      category: 'USER',
      message: `working memory exceeds 8192 byte cap (got ${bytes})`,
      details: { bytes, cap: 8192 },
    })
  }
}

export class MemoryPersistFailedError extends AgentError {
  constructor(cause: unknown) {
    super({
      code: 'MEMORY_PERSIST_FAILED',
      category: 'SYSTEM',
      message: 'memory persistence failed',
      cause,
    })
  }
}
