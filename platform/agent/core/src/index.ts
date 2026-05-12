// Types

export type { KernelErrorCategory, KernelErrorDomain, KernelErrorJSON } from './errors'

// Errors
export {
  AgentError,
  KernelError,
  kernelErrorOf,
  LlmError,
  ToolError,
  ToolValidationError,
} from './errors'
export type { ErrorClass } from './errors/classify'
export { classifyError, isAbortError } from './errors/classify'
export type * from './types'
