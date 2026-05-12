import type { RunInput, StepResult } from './run'

export interface ProcessorContext {
  runId: string
  abort(): never
  abortSignal: AbortSignal
  retryCount: number
  writer: { custom(chunk: unknown): void }
}

export interface Processor {
  processInput?(ctx: ProcessorContext, input: RunInput): Promise<RunInput>
  processOutputStep?(ctx: ProcessorContext, step: StepResult): Promise<StepResult>
  processAPIError?(ctx: ProcessorContext, err: unknown): Promise<'retry' | 'rethrow'>
}
