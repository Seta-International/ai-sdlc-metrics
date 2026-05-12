import { AgentError } from '../errors'
import type { Processor, ProcessorContext, RunInput, StepResult } from '../types'

export class ProcessorAbortSignal extends Error {
  constructor() {
    super('processor aborted')
    this.name = 'ProcessorAbortSignal'
  }
}

export async function runProcessInput(
  processors: Processor[],
  ctx: ProcessorContext,
  input: RunInput,
): Promise<RunInput> {
  let working = input
  for (let i = 0; i < processors.length; i++) {
    const p = processors[i]
    if (!p?.processInput) continue
    try {
      working = await p.processInput(ctx, working)
    } catch (err) {
      if (err instanceof ProcessorAbortSignal) throw err
      throw new AgentError({
        code: 'PROCESSOR_FAILED',
        category: 'SYSTEM',
        message: `processor[${i}].processInput threw`,
        details: { processorIndex: i, hookName: 'processInput' },
        cause: err,
      })
    }
  }
  return working
}

export async function runProcessOutputStep(
  processors: Processor[],
  ctx: ProcessorContext,
  step: StepResult,
): Promise<StepResult> {
  let working = step
  for (let i = 0; i < processors.length; i++) {
    const p = processors[i]
    if (!p?.processOutputStep) continue
    try {
      working = await p.processOutputStep(ctx, working)
    } catch (err) {
      if (err instanceof ProcessorAbortSignal) throw err
      throw new AgentError({
        code: 'PROCESSOR_FAILED',
        category: 'SYSTEM',
        message: `processor[${i}].processOutputStep threw`,
        details: { processorIndex: i, hookName: 'processOutputStep' },
        cause: err,
      })
    }
  }
  return working
}

export async function runProcessAPIError(
  processors: Processor[],
  ctx: ProcessorContext,
  err: unknown,
): Promise<'retry' | 'rethrow'> {
  let verdict: 'retry' | 'rethrow' = 'rethrow'
  for (let i = 0; i < processors.length; i++) {
    const p = processors[i]
    if (!p?.processAPIError) continue
    try {
      const v = await p.processAPIError(ctx, err)
      if (v === 'retry') return 'retry'
      verdict = v
    } catch (innerErr) {
      if (innerErr instanceof ProcessorAbortSignal) throw innerErr
      throw new AgentError({
        code: 'PROCESSOR_FAILED',
        category: 'SYSTEM',
        message: `processor[${i}].processAPIError threw`,
        details: { processorIndex: i, hookName: 'processAPIError' },
        cause: innerErr,
      })
    }
  }
  return verdict
}
