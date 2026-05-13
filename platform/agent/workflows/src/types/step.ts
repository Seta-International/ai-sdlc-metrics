import type { Logger } from '@seta/observability'
import type { ZodType } from 'zod'

export interface BackoffOpts {
  baseDelayMs?: number
  maxDelayMs?: number
  jitter?: boolean
}

export interface RetryPolicy {
  maxAttempts: number
  backoff?: BackoffOpts
  shouldRetry?: (err: unknown) => boolean
}

export interface StepCtx<TInput> {
  readonly input: TInput
  readonly runId: string
  readonly stepId: string
  readonly workflowId: string
  readonly tenantId: string
  readonly logger: Logger
  readonly signal: AbortSignal
  readonly resumePayload?: unknown

  bail(reason?: string): never
  suspend<P>(opts: { resumeLabel: string; payload?: P }): never
}

export type StepExecuteFn<TIn, TOut> = (input: TIn, ctx: StepCtx<TIn>) => Promise<TOut>

declare const StepBrand: unique symbol

export interface Step<TIn, TOut, TId extends string = string> {
  readonly id: TId
  readonly inputSchema: ZodType<TIn>
  readonly outputSchema: ZodType<TOut>
  readonly execute: StepExecuteFn<TIn, TOut>
  readonly retry?: RetryPolicy
  readonly [StepBrand]: true
}

export type StepInput<S> = S extends Step<infer In, unknown, string> ? In : never
export type StepOutput<S> = S extends Step<unknown, infer Out, string> ? Out : never
export type StepId<S> = S extends Step<unknown, unknown, infer Id> ? Id : never
