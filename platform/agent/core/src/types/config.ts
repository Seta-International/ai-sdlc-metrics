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

export type StopCondition = (steps: StepResult[]) => boolean | Promise<boolean>

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
