import { randomUUID } from 'node:crypto'
import { SpanStatusCode, trace } from '@opentelemetry/api'
import { AgentError } from '../errors'
import type {
  AgentConfig,
  KernelChunk,
  KernelMessage,
  ProcessorContext,
  RunCtx,
  RunLoopOptions,
  StepResult,
  TokenUsage,
  Tool,
} from '../types'
import type { ToolCall } from './execute-tools'
import { executeTools } from './execute-tools'
import { runModelStepWithFallback } from './fallback'
import { ProcessorAbortSignal, runProcessOutputStep } from './processors'

const DEFAULT_MAX_STEPS = 16

function stampId(m: KernelMessage): KernelMessage {
  return m.id ? m : { ...m, id: randomUUID() }
}

export interface ToolLoopArgs {
  cfg: AgentConfig
  ctx: RunCtx
  opts: RunLoopOptions
  initialMessages: KernelMessage[]
  tools: Tool[]
  workingMemoryMsgCount?: number
  refreshWorkingMemoryMessages?: () => Promise<KernelMessage[]>
  saveIterationMessages?: (messages: KernelMessage[]) => Promise<void>
}

type LoopStopReason =
  | 'natural_stop'
  | 'natural_length'
  | 'stop_when'
  | 'step_limit'
  | 'error'
  | 'aborted'
  | 'processor_aborted'

export async function* runToolLoop(
  args: ToolLoopArgs,
): AsyncGenerator<KernelChunk, KernelMessage[]> {
  const { cfg, ctx, opts, initialMessages, tools } = args
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS
  const accumulatedSteps: StepResult[] = []
  const addedMessages: KernelMessage[] = []
  let messages = initialMessages
  let modelStepCount = 0
  let persistedCount = 0

  const loopSpan = trace
    .getTracer('@seta/agent-core')
    .startSpan('agent.run.loop', { attributes: { 'run.id': ctx.runId } })
  let spanEnded = false
  const endSpan = (reason: LoopStopReason) => {
    if (spanEnded) return
    spanEnded = true
    loopSpan.setAttribute('loop.stop_reason', reason)
    loopSpan.setAttribute('loop.iterations', modelStepCount)
    loopSpan.setStatus({
      code: reason === 'error' ? SpanStatusCode.ERROR : SpanStatusCode.OK,
    })
    loopSpan.end()
  }

  try {
    while (true) {
      if (ctx.signal.aborted) {
        yield { type: 'abort' }
        endSpan('aborted')
        return addedMessages
      }

      const modelStep = yield* runModelStepWithFallback({ cfg, ctx, opts, messages, tools })
      modelStepCount++
      accumulatedSteps.push(modelStep)
      if (modelStep.message) {
        const stamped = stampId(modelStep.message)
        messages = [...messages, stamped]
        addedMessages.push(stamped)
      }
      if (opts.processors?.length) {
        try {
          const rewritten = await runProcessOutputStep(
            opts.processors,
            makeProcessorCtx(ctx),
            modelStep,
          )
          if (rewritten.message && rewritten.message !== modelStep.message) {
            const stamped = stampId(rewritten.message)
            messages[messages.length - 1] = stamped
            addedMessages[addedMessages.length - 1] = stamped
          }
        } catch (err) {
          if (err instanceof ProcessorAbortSignal) {
            yield processorAbortChunk(
              'processOutputStep',
              findProcessorIndex(opts.processors, 'processOutputStep'),
            )
            yield { type: 'abort' }
            endSpan('processor_aborted')
            return addedMessages
          }
          throw err
        }
      }

      if (modelStep.error) {
        endSpan('error')
        return addedMessages
      }
      if (modelStep.finishReason !== 'tool_calls') {
        endSpan(modelStep.finishReason === 'length' ? 'natural_length' : 'natural_stop')
        return addedMessages
      }

      if (modelStepCount >= maxSteps) {
        yield synthesizeFinish('length', sumUsage(accumulatedSteps))
        endSpan('step_limit')
        return addedMessages
      }

      const toolCalls = extractToolCalls(modelStep.message)
      const toolSteps = await executeTools({ toolCalls, tools, ctx, opts })
      for (const step of toolSteps) {
        accumulatedSteps.push(step)
        if (step.message) {
          const stamped = stampId(step.message)
          messages = [...messages, stamped]
          addedMessages.push(stamped)
        }
        if (opts.processors?.length) {
          try {
            const rewritten = await runProcessOutputStep(
              opts.processors,
              makeProcessorCtx(ctx),
              step,
            )
            if (rewritten.message && rewritten.message !== step.message) {
              const stamped = stampId(rewritten.message)
              messages[messages.length - 1] = stamped
              addedMessages[addedMessages.length - 1] = stamped
            }
          } catch (err) {
            if (err instanceof ProcessorAbortSignal) {
              yield processorAbortChunk(
                'processOutputStep',
                findProcessorIndex(opts.processors, 'processOutputStep'),
              )
              yield { type: 'abort' }
              endSpan('processor_aborted')
              return addedMessages
            }
            throw err
          }
        }
      }

      if (opts.onIterationComplete) {
        await opts.onIterationComplete(accumulatedSteps)
      }

      if (args.saveIterationMessages) {
        const iterMsgs = addedMessages.slice(persistedCount)
        if (iterMsgs.length > 0) {
          await args.saveIterationMessages(iterMsgs)
          persistedCount = addedMessages.length
        }
      }

      if (opts.stopWhen) {
        const predicates = Array.isArray(opts.stopWhen) ? opts.stopWhen : [opts.stopWhen]
        let results: boolean[]
        try {
          results = await Promise.all(
            predicates.map((p) => Promise.resolve(p({ steps: accumulatedSteps }))),
          )
        } catch (err) {
          yield {
            type: 'error',
            error: new AgentError({
              code: 'STOP_WHEN_FAILED',
              category: 'SYSTEM',
              message: 'stopWhen predicate threw',
              cause: err,
            }),
          }
          endSpan('error')
          return addedMessages
        }
        if (results.some(Boolean)) {
          yield synthesizeFinish('stop', sumUsage(accumulatedSteps))
          endSpan('stop_when')
          return addedMessages
        }
      }

      if (args.workingMemoryMsgCount && args.refreshWorkingMemoryMessages) {
        const refreshed = await args.refreshWorkingMemoryMessages()
        messages = [...refreshed, ...messages.slice(args.workingMemoryMsgCount)]
      }
    }
  } finally {
    if (!spanEnded) endSpan('error')
  }
}

function extractToolCalls(message: KernelMessage | undefined): ToolCall[] {
  if (!message) {
    throw new AgentError({
      code: 'ADAPTER_PROTOCOL_VIOLATION',
      category: 'THIRD_PARTY',
      message: 'finishReason=tool_calls but no message produced',
    })
  }
  const calls = message.content
    .filter(
      (c): c is { type: 'tool_use'; toolCallId: string; name: string; args: unknown } =>
        c.type === 'tool_use',
    )
    .map((c) => ({ toolCallId: c.toolCallId, name: c.name, args: c.args }))
  if (calls.length === 0) {
    throw new AgentError({
      code: 'ADAPTER_PROTOCOL_VIOLATION',
      category: 'THIRD_PARTY',
      message: 'finishReason=tool_calls but message has no tool_use blocks',
    })
  }
  return calls
}

function sumUsage(steps: StepResult[]): TokenUsage | undefined {
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
  let any = false
  for (const s of steps) {
    for (const c of s.chunks) {
      if (c.type === 'finish' && c.usage) {
        usage.inputTokens += c.usage.inputTokens
        usage.outputTokens += c.usage.outputTokens
        if (c.usage.cacheReadInputTokens !== undefined) {
          usage.cacheReadInputTokens =
            (usage.cacheReadInputTokens ?? 0) + c.usage.cacheReadInputTokens
        }
        if (c.usage.cacheCreationInputTokens !== undefined) {
          usage.cacheCreationInputTokens =
            (usage.cacheCreationInputTokens ?? 0) + c.usage.cacheCreationInputTokens
        }
        any = true
      }
    }
  }
  return any ? usage : undefined
}

function synthesizeFinish(reason: 'stop' | 'length', usage: TokenUsage | undefined): KernelChunk {
  return usage ? { type: 'finish', reason, usage } : { type: 'finish', reason }
}

function processorAbortChunk(hookName: string, processorIndex: number): KernelChunk {
  return {
    type: 'error',
    error: new AgentError({
      code: 'PROCESSOR_ABORTED',
      category: 'USER',
      message: 'processor invoked ctx.abort()',
      details: { hookName, processorIndex },
    }),
  }
}

function findProcessorIndex(
  processors: Array<{ processOutputStep?: unknown }>,
  hook: 'processOutputStep',
): number {
  return processors.findIndex((p) => p[hook] !== undefined)
}

function makeProcessorCtx(ctx: RunCtx): ProcessorContext {
  return {
    runId: ctx.runId,
    abort: (): never => {
      throw new ProcessorAbortSignal()
    },
    abortSignal: ctx.signal,
    retryCount: ctx.retryCount,
    writer: { custom: () => {} },
  }
}
