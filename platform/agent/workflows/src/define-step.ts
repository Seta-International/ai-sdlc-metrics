import type { ZodType } from 'zod'
import type { RetryPolicy, Step, StepExecuteFn } from './types/step'

export interface DefineStepOptions<TIn, TOut, TId extends string> {
  id: TId
  inputSchema: ZodType<TIn>
  outputSchema: ZodType<TOut>
  execute: StepExecuteFn<TIn, TOut>
  retry?: RetryPolicy
}

export function defineStep<TIn, TOut, TId extends string>(
  opts: DefineStepOptions<TIn, TOut, TId>,
): Step<TIn, TOut, TId> {
  return {
    id: opts.id,
    inputSchema: opts.inputSchema,
    outputSchema: opts.outputSchema,
    execute: opts.execute,
    ...(opts.retry ? { retry: opts.retry } : {}),
  } as Step<TIn, TOut, TId>
}
