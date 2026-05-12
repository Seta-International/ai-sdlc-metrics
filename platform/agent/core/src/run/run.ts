import { kernelErrorOf } from '../errors'
import { isAbortError } from '../errors/classify'
import { NullMemoryProvider } from '../memory/null-provider'
import { prepareTools } from '../models/prepare-tools'
import type {
  AdapterRequest,
  AgentConfig,
  KernelChunk,
  MemoryContext,
  RunInput,
  RunLoopOptions,
} from '../types'
import { createRunCtx } from './make-run-ctx'

const CACHE_TTL_AUTO_THRESHOLD = 2048

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
    scope: 'thread',
  }

  try {
    const recall = await memory.recall(memCtx)
    const { adapter, bareModel } = opts.adapters.select(cfg.model)
    const messages = [...recall.messages, ...input.messages]
    const tools = cfg.tools && cfg.tools.length > 0 ? prepareTools(cfg.tools) : undefined
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
      ...(tools !== undefined ? { tools } : {}),
      ...(cfg.maxTokens !== undefined ? { maxTokens: cfg.maxTokens } : {}),
      cacheTtl,
    }

    const stream = await adapter.stream(req, ctx)

    try {
      try {
        for await (const chunk of stream) {
          if (ctx.signal.aborted) {
            yield { type: 'abort' }
            return
          }
          yield chunk
        }
      } finally {
        stream.abort()
      }
      const final = await stream.finalMessage()
      await memory.saveTurn(memCtx, [...input.messages, final])
    } catch (err) {
      if (isAbortError(err) && ctx.signal.aborted) {
        yield { type: 'abort' }
        return
      }
      yield { type: 'error', error: kernelErrorOf(err) }
    }
  } catch (err) {
    yield { type: 'error', error: kernelErrorOf(err) }
  }
}
