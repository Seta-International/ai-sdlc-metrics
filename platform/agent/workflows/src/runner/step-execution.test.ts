import { trace } from '@opentelemetry/api'
import { logger as baseLogger } from '@seta/observability'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineStep } from '../define-step'
import {
  StepExecutionError,
  StepInputValidationError,
  StepOutputValidationError,
  WorkflowBailed,
} from '../errors'
import { executeStep } from './step-execution'

const tracer = trace.getTracer('test')

const baseCtx = {
  runId: 'r1',
  workflowId: 'wf',
  tenantId: 't1',
  logger: baseLogger.child({ test: true }),
  tracer,
  signal: new AbortController().signal,
}

describe('executeStep', () => {
  const okStep = defineStep({
    id: 'ok',
    inputSchema: z.object({ x: z.number() }),
    outputSchema: z.object({ y: z.number() }),
    async execute(input) {
      return { y: input.x * 2 }
    },
  })

  it('validates input, runs execute, validates output', async () => {
    const out = await executeStep(okStep, { x: 21 }, baseCtx)
    expect(out).toEqual({ y: 42 })
  })

  it('rejects bad input with StepInputValidationError', async () => {
    await expect(executeStep(okStep, { x: 'bad' as unknown as number }, baseCtx)).rejects.toThrow(
      StepInputValidationError,
    )
  })

  it('rejects bad output with StepOutputValidationError', async () => {
    const badStep = defineStep({
      id: 'bad-out',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      async execute() {
        return { y: 'not a number' as unknown as number }
      },
    })
    await expect(executeStep(badStep, { x: 1 }, baseCtx)).rejects.toThrow(StepOutputValidationError)
  })

  it('wraps thrown errors in StepExecutionError', async () => {
    const throwStep = defineStep({
      id: 'throw',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      async execute() {
        throw new Error('boom')
      },
    })
    await expect(executeStep(throwStep, { x: 1 }, baseCtx)).rejects.toThrow(StepExecutionError)
  })

  it('propagates WorkflowBailed without wrapping', async () => {
    const bailStep = defineStep({
      id: 'bail',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      async execute(_input, ctx) {
        return ctx.bail('done early')
      },
    })
    await expect(executeStep(bailStep, { x: 1 }, baseCtx)).rejects.toThrow(WorkflowBailed)
  })

  it('exposes runId, stepId, workflowId, tenantId, signal on ctx', async () => {
    let seen: {
      runId?: string
      stepId?: string
      workflowId?: string
      tenantId?: string
      hasSignal?: boolean
    } = {}
    const peekStep = defineStep({
      id: 'peek',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      async execute(_input, ctx) {
        seen = {
          runId: ctx.runId,
          stepId: ctx.stepId,
          workflowId: ctx.workflowId,
          tenantId: ctx.tenantId,
          hasSignal: ctx.signal instanceof AbortSignal,
        }
        return { y: 0 }
      },
    })
    await executeStep(peekStep, { x: 0 }, baseCtx)
    expect(seen).toEqual({
      runId: 'r1',
      stepId: 'peek',
      workflowId: 'wf',
      tenantId: 't1',
      hasSignal: true,
    })
  })
})
