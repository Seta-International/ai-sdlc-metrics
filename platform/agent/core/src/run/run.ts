import { AgentError, kernelErrorOf } from '../errors'
import { isAbortError } from '../errors/classify'
import { NullMemoryProvider } from '../memory/null-provider'
import type {
  AgentConfig,
  KernelChunk,
  KernelMessage,
  MemoryContext,
  Processor,
  ProcessorContext,
  RunCtx,
  RunInput,
  RunLoopOptions,
} from '../types'
import { createRunCtx } from './make-run-ctx'
import { ProcessorAbortSignal, runProcessInput } from './processors'
import { runToolLoop } from './tool-loop'

export async function* run(
  cfg: AgentConfig,
  input: RunInput,
  opts: RunLoopOptions,
): AsyncIterable<KernelChunk> {
  const ctx = createRunCtx({
    signal: opts.signal ?? new AbortController().signal,
    ...(opts.generateId !== undefined ? { generateId: opts.generateId } : {}),
    ...(opts.now !== undefined ? { now: opts.now } : {}),
    ...(opts.currentDate !== undefined ? { currentDate: opts.currentDate } : {}),
  })

  const memory = opts.memory ?? new NullMemoryProvider()
  const memCtx: MemoryContext = {
    threadId: input.threadId ?? ctx.runId,
    ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
    scope: 'resource',
  }

  try {
    validateRunLoopOptions(opts)

    const recalled = await memory.recall(memCtx)
    let workingInput = input
    if (opts.processors?.length) {
      try {
        workingInput = await runProcessInput(opts.processors, makeProcessorCtx(ctx), input)
      } catch (err) {
        if (err instanceof ProcessorAbortSignal) {
          yield {
            type: 'error',
            error: new AgentError({
              code: 'PROCESSOR_ABORTED',
              category: 'USER',
              message: 'processor invoked ctx.abort()',
              details: {
                hookName: 'processInput',
                processorIndex: firstHookIndex(opts.processors, 'processInput'),
              },
            }),
          }
          yield { type: 'abort' }
          return
        }
        throw err
      }
    }

    const initialMessages = [...recalled.messages, ...workingInput.messages]
    const iter = runToolLoop({
      cfg,
      ctx,
      opts,
      initialMessages,
      tools: cfg.tools ?? [],
    })

    let errored = false
    let added: KernelMessage[] = []
    let completed = false
    try {
      while (true) {
        const res = await iter.next()
        if (res.done) {
          added = res.value
          completed = true
          break
        }
        if (res.value.type === 'error') errored = true
        yield res.value
      }
    } finally {
      if (!completed) await iter.return?.(added)
    }

    if (!errored && !ctx.signal.aborted) {
      await memory.saveTurn(memCtx, [...workingInput.messages, ...added])
    }
  } catch (err) {
    if (isAbortError(err) && ctx.signal.aborted) {
      yield { type: 'abort' }
      return
    }
    yield { type: 'error', error: kernelErrorOf(err) }
  }
}

function validateRunLoopOptions(opts: RunLoopOptions): void {
  if (opts.maxSteps !== undefined && opts.maxSteps <= 0) {
    throw new AgentError({
      code: 'INVALID_MAX_STEPS',
      category: 'USER',
      message: `maxSteps must be > 0, got ${opts.maxSteps}`,
      details: { maxSteps: opts.maxSteps },
    })
  }
  if (opts.toolCallConcurrency !== undefined && opts.toolCallConcurrency <= 0) {
    throw new AgentError({
      code: 'INVALID_CONCURRENCY',
      category: 'USER',
      message: `toolCallConcurrency must be > 0, got ${opts.toolCallConcurrency}`,
      details: { toolCallConcurrency: opts.toolCallConcurrency },
    })
  }
}

function firstHookIndex(processors: Processor[], hook: keyof Processor): number {
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
