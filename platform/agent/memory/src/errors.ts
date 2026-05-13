import { AgentError } from '@seta/agent-core'

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
