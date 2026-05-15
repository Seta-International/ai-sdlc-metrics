import { AgentError, kernelErrorOf } from '../errors'
import { isAbortError } from '../errors/classify'
import { NullMemoryProvider } from '../memory/null-provider'
import type { KernelChunk } from '../types/chunk'
import type { AgentConfig, RunLoopOptions } from '../types/config'
import type { MemoryContext } from '../types/memory'
import type { KernelMessage } from '../types/message'
import type { Processor, ProcessorContext } from '../types/processor'
import type { RunCtx, RunInput } from '../types/run'
import { createRunCtx } from './make-run-ctx'
import { ProcessorAbortSignal, runProcessInput } from './processors'
import { runToolLoop } from './tool-loop'
import {
  buildWorkingMemoryMessages,
  buildWorkingMemoryTools,
  filterWorkingMemoryToolMessages,
  makeMemoryContext,
} from './working-memory'

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
  const memCtx: MemoryContext = makeMemoryContext(cfg, input, ctx.runId)

  try {
    validateRunLoopOptions(opts)

    const [recalled, workingMemoryMessages] = await Promise.all([
      memory.recall(memCtx),
      buildWorkingMemoryMessages(cfg, memory, memCtx),
    ])
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

    const initialMessages = [
      ...workingMemoryMessages,
      ...recalled.messages,
      ...workingInput.messages,
    ]
    const configuredTools = cfg.tools ?? []
    const memoryTools = configuredTools.some((tool) => tool.id === 'updateWorkingMemory')
      ? []
      : buildWorkingMemoryTools(cfg, memory, memCtx)
    const tools = [...configuredTools, ...memoryTools]
    const iter = runToolLoop({
      cfg,
      ctx,
      opts,
      initialMessages,
      tools,
      workingMemoryMsgCount: workingMemoryMessages.length,
      ...(workingMemoryMessages.length > 0
        ? { refreshWorkingMemoryMessages: () => buildWorkingMemoryMessages(cfg, memory, memCtx) }
        : {}),
      saveIterationMessages: async (msgs) => {
        const filtered = filterWorkingMemoryToolMessages(msgs)
        if (filtered.length > 0) {
          await memory.saveTurn(memCtx, filtered)
        }
      },
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
      await memory.saveTurn(
        memCtx,
        filterWorkingMemoryToolMessages([...workingInput.messages, ...added]),
      )
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
