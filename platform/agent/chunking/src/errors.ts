import type { KernelErrorCategory } from '@seta/agent-core'
import { KernelError } from '@seta/agent-core'

interface ChunkingErrorArgs {
  message: string
  code?: string
  category?: KernelErrorCategory
  details?: Record<string, unknown>
  cause?: unknown
}

export class ChunkingError extends KernelError {
  constructor(args: ChunkingErrorArgs) {
    super({
      code: args.code ?? 'CHUNKING_FAILED',
      domain: 'KERNEL',
      category: args.category ?? 'SYSTEM',
      message: args.message,
      details: args.details,
      cause: args.cause,
    })
  }
}
