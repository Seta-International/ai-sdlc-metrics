import type { AdapterRegistry } from '../models/registry'
import type { MemoryProvider } from './memory'
import type { KernelMessage } from './message'
import type { Processor } from './processor'
import type { StepResult } from './run'
import type { JsonSchemaTool, Tool } from './tool'

export interface AgentConfig {
  model: string
  systemPrompt?: string
  maxTokens?: number
  cacheTtl?: '5m' | '1h' | null
  tools?: Tool[]
  fallback?: string[]
}

/**
 * Evaluated after each iteration (one model call + its tool executions).
 *
 * Only invoked when the most recent model step's `finishReason === 'tool_calls'`.
 * On natural `stop` or `length`, predicates are not consulted.
 *
 * Array form combines with logical OR; predicates may be async and are awaited
 * in parallel.
 */
export type StopCondition = (args: { steps: StepResult[] }) => boolean | Promise<boolean>

export interface RunLoopOptions {
  adapters: AdapterRegistry
  memory?: MemoryProvider
  signal?: AbortSignal
  processors?: Processor[]
  maxSteps?: number
  stopWhen?: StopCondition | StopCondition[]
  toolCallConcurrency?: number
  perToolBudget?: { maxCalls?: number; maxTokens?: number; timeoutMs?: number }
  onIterationComplete?: (steps: StepResult[]) => void | Promise<void>
  generateId?: () => string
  now?: () => number
  currentDate?: () => Date
}

export interface AdapterRequest {
  model: string
  messages: KernelMessage[]
  systemPrompt?: string
  tools?: JsonSchemaTool[]
  maxTokens?: number
  cacheTtl?: '5m' | '1h' | null
}
