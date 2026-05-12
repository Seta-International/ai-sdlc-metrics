import { DomainError } from '@seta/middleware'
import { v7 as uuidv7 } from 'uuid'

export type KernelErrorDomain = 'AGENT' | 'LLM' | 'TOOL' | 'KERNEL'
export type KernelErrorCategory = 'USER' | 'SYSTEM' | 'THIRD_PARTY'

export interface KernelErrorJSON {
  id: string
  code: string
  domain: KernelErrorDomain
  category: KernelErrorCategory
  details?: Record<string, unknown>
  message: string
}

interface KernelErrorArgs {
  code: string
  domain: KernelErrorDomain
  category: KernelErrorCategory
  message: string
  details?: Record<string, unknown>
  cause?: unknown
  status?: number
}

const ERROR_TYPE_BASE = 'https://os.seta-international.com/errors'

export class KernelError extends DomainError {
  readonly id: string
  readonly code: string
  readonly domain: KernelErrorDomain
  readonly category: KernelErrorCategory
  readonly details?: Record<string, unknown>

  constructor(args: KernelErrorArgs) {
    const status = args.status ?? 500
    super(status, args.message, {
      type: `${ERROR_TYPE_BASE}/${args.domain.toLowerCase()}/${args.code}`,
      ...(args.details !== undefined ? { detail: JSON.stringify(args.details) } : {}),
      cause: args.cause,
    })
    this.id = uuidv7()
    this.code = args.code
    this.domain = args.domain
    this.category = args.category
    if (args.details !== undefined) {
      this.details = args.details
    }
  }

  toJSON(): KernelErrorJSON {
    return {
      id: this.id,
      code: this.code,
      domain: this.domain,
      category: this.category,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    }
  }
}

type SubclassArgs = Omit<KernelErrorArgs, 'domain'>

export class AgentError extends KernelError {
  constructor(args: SubclassArgs) {
    super({ ...args, domain: 'AGENT' })
  }
}

export class LlmError extends KernelError {
  constructor(args: SubclassArgs) {
    super({ ...args, domain: 'LLM' })
  }
}

export class ToolError extends KernelError {
  constructor(args: SubclassArgs) {
    super({ ...args, domain: 'TOOL' })
  }
}

export class ToolValidationError extends ToolError {}

export function kernelErrorOf(err: unknown): KernelError {
  if (err instanceof KernelError) return err
  if (err instanceof Error) {
    return new KernelError({
      code: 'UNKNOWN_KERNEL_ERROR',
      domain: 'KERNEL',
      category: 'SYSTEM',
      message: err.message,
      cause: err,
    })
  }
  return new KernelError({
    code: 'UNKNOWN_KERNEL_ERROR',
    domain: 'KERNEL',
    category: 'SYSTEM',
    message: typeof err === 'string' ? err : 'Unknown error',
    cause: err,
  })
}
