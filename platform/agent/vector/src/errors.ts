import { AgentError } from '@seta/agent-core'

export class VectorQueryFailedError extends AgentError {
  constructor(cause: unknown) {
    super({
      code: 'VECTOR_QUERY_FAILED',
      category: 'SYSTEM',
      message: 'Failed to query vector store',
      cause,
    })
  }
}

export class VectorInsertFailedError extends AgentError {
  constructor(cause: unknown) {
    super({
      code: 'VECTOR_INSERT_FAILED',
      category: 'SYSTEM',
      message: 'Failed to insert chunks',
      cause,
    })
  }
}
