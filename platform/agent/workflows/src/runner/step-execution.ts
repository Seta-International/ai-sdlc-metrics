import { createHash } from 'node:crypto'
import type { Tracer } from '@opentelemetry/api'
import { SpanStatusCode } from '@opentelemetry/api'
import type { Logger } from '@seta/observability'
import {
  StepExecutionError,
  StepInputValidationError,
  StepOutputValidationError,
  WorkflowBailed,
} from '../errors'
import type { Step, StepCtx } from '../types/step'

export interface RunContext {
  readonly runId: string
  readonly workflowId: string
  readonly tenantId: string
  readonly logger: Logger
  readonly tracer: Tracer
  readonly signal: AbortSignal
}

function hashInput(value: unknown): string {
  let json: string
  try {
    json = JSON.stringify(value) ?? 'undefined'
  } catch {
    json = '<unserializable>'
  }
  return createHash('sha256').update(json).digest('hex')
}

export async function executeStep<TIn, TOut, TId extends string>(
  step: Step<TIn, TOut, TId>,
  rawInput: unknown,
  run: RunContext,
): Promise<TOut> {
  const stepLogger = run.logger.child({ stepId: step.id })

  const inputParsed = step.inputSchema.safeParse(rawInput)
  if (!inputParsed.success) {
    throw new StepInputValidationError({
      runId: run.runId,
      stepId: step.id,
      cause: inputParsed.error,
    })
  }
  const input = inputParsed.data

  const ctx: StepCtx<TIn> = {
    input,
    runId: run.runId,
    stepId: step.id,
    workflowId: run.workflowId,
    tenantId: run.tenantId,
    logger: stepLogger,
    signal: run.signal,
    bail(reason) {
      throw new WorkflowBailed(reason ?? 'workflow bailed')
    },
  }

  return await run.tracer.startActiveSpan(`step.${step.id}`, async (span) => {
    span.setAttribute('step.id', step.id)
    span.setAttribute('step.workflow.id', run.workflowId)
    span.setAttribute('step.run.id', run.runId)
    span.setAttribute('tenant.id', run.tenantId)
    span.setAttribute('step.input.hash', hashInput(input))

    let rawOutput: TOut
    try {
      rawOutput = await step.execute(input, ctx)
    } catch (err) {
      if (err instanceof WorkflowBailed) {
        span.setStatus({ code: SpanStatusCode.OK })
        span.end()
        throw err
      }
      span.recordException(err as Error)
      span.setStatus({ code: SpanStatusCode.ERROR })
      span.end()
      throw new StepExecutionError({ runId: run.runId, stepId: step.id, cause: err })
    }

    const outputParsed = step.outputSchema.safeParse(rawOutput)
    if (!outputParsed.success) {
      span.setStatus({ code: SpanStatusCode.ERROR })
      span.end()
      throw new StepOutputValidationError({
        runId: run.runId,
        stepId: step.id,
        cause: outputParsed.error,
      })
    }

    span.setStatus({ code: SpanStatusCode.OK })
    span.end()
    return outputParsed.data
  })
}
