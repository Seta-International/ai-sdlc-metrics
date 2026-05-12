import type { KernelError } from '../errors'
import { kernelErrorOf, LlmError } from '../errors'
import { isAbortError } from '../errors/classify'
import { prepareTools } from '../models/prepare-tools'
import type {
  AdapterRequest,
  AgentConfig,
  KernelChunk,
  KernelMessage,
  ProcessorContext,
  RunCtx,
  RunLoopOptions,
  StepResult,
  Tool,
} from '../types'
import { ProcessorAbortSignal, runProcessAPIError } from './processors'

const CACHE_TTL_AUTO_THRESHOLD = 2048
const FAILOVER_CODES = new Set(['LLM_TRANSIENT_EXHAUSTED', 'LLM_SERVER_ERROR', 'LLM_RATE_LIMITED'])
const MAX_PROCESSOR_RETRIES = 1

export interface RunModelArgs {
  cfg: AgentConfig
  ctx: RunCtx
  opts: RunLoopOptions
  messages: KernelMessage[]
  tools: Tool[] | undefined
}

export async function* runModelStepWithFallback(
  args: RunModelArgs,
): AsyncGenerator<KernelChunk, StepResult> {
  const { cfg, ctx, opts } = args
  const candidates = [cfg.model, ...(cfg.fallback ?? [])]
  let lastErr: KernelError | undefined
  let processorRetries = 0

  for (let i = 0; i < candidates.length; i++) {
    if (ctx.signal.aborted) break
    const model = candidates[i]
    if (model === undefined) break

    try {
      return yield* runOneModelStep({ ...args, modelId: model })
    } catch (err) {
      if (isAbortError(err) && ctx.signal.aborted) throw err
      const kerr = kernelErrorOf(err)
      lastErr = kerr

      if (opts.processors?.length && processorRetries < MAX_PROCESSOR_RETRIES) {
        const decision = await runProcessAPIError(opts.processors, makeProcessorCtx(ctx), kerr)
        if (decision === 'retry') {
          processorRetries++
          i--
          continue
        }
      }

      if (!FAILOVER_CODES.has(kerr.code)) break
    }
  }

  const err =
    lastErr ??
    new LlmError({
      code: 'LLM_UNKNOWN',
      category: 'SYSTEM',
      message: 'no model candidate produced a result',
    })
  yield { type: 'error', error: err }
  return {
    kind: 'model',
    chunks: [{ type: 'error', error: err }],
    finishReason: 'error',
    error: err,
  }
}

interface OneArgs extends RunModelArgs {
  modelId: string
}

async function* runOneModelStep(args: OneArgs): AsyncGenerator<KernelChunk, StepResult> {
  const { cfg, ctx, opts, messages, tools, modelId } = args
  const { adapter, bareModel } = opts.adapters.select(modelId)
  const preparedTools = tools && tools.length > 0 ? prepareTools(tools) : undefined
  const systemPrompt = cfg.systemPrompt
  const cacheTtl: '5m' | '1h' | null =
    cfg.cacheTtl !== undefined
      ? cfg.cacheTtl
      : systemPrompt !== undefined && systemPrompt.length > CACHE_TTL_AUTO_THRESHOLD
        ? '5m'
        : null

  const req: AdapterRequest = {
    model: bareModel,
    messages,
    ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    ...(preparedTools !== undefined ? { tools: preparedTools } : {}),
    ...(cfg.maxTokens !== undefined ? { maxTokens: cfg.maxTokens } : {}),
    cacheTtl,
  }

  const stream = await adapter.stream(req, ctx)
  const collected: KernelChunk[] = []
  let finishReason: StepResult['finishReason']

  try {
    for await (const chunk of stream) {
      if (ctx.signal.aborted) {
        const e = new Error('aborted')
        e.name = 'AbortError'
        throw e
      }
      collected.push(chunk)
      if (chunk.type === 'finish') finishReason = chunk.reason
      yield chunk
    }
  } finally {
    stream.abort()
  }
  const message = await stream.finalMessage()
  return {
    kind: 'model',
    chunks: collected,
    message,
    ...(finishReason !== undefined ? { finishReason } : {}),
  }
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
