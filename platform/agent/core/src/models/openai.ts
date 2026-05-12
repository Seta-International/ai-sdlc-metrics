import OpenAI from 'openai'
import { LlmError } from '../errors'
import type { AdapterRequest, KernelChunk, KernelMessage, ModelStream, RunCtx } from '../types'
import type { ModelAdapter } from './adapter'
import { startLlmSpan } from './span'
import { estimateMessagesInputTokens } from './tokens'
import {
  flushPendingFinish,
  kernelToOpenAI,
  newOpenAIStreamState,
  openaiEventToKernelChunks,
  openaiFinalToKernelMessage,
} from './translate/openai'

export interface OpenAIAdapterConfig {
  apiKey: string
  baseURL?: string
  defaultHeaders?: Record<string, string>
  organization?: string
  project?: string
  maxRetries?: number
  timeoutMs?: number
}

type ProviderLabel = 'openai' | 'azure-openai'

export function mapOpenAIError(
  err: unknown,
  model: string,
  providerLabel: ProviderLabel = 'openai',
): LlmError {
  if (err instanceof OpenAI.APIError) {
    const status = err.status
    const headers = err.headers as Record<string, string> | undefined
    const requestId = headers?.['x-request-id']
    const details: Record<string, unknown> = { provider: providerLabel, model, status }
    if (typeof requestId === 'string') details.requestId = requestId

    if (status === 401 || status === 403) {
      return new LlmError({
        code: 'LLM_AUTH_FAILED',
        category: 'SYSTEM',
        message: err.message,
        details,
        cause: err,
      })
    }
    if (status === 400) {
      return new LlmError({
        code: 'LLM_BAD_REQUEST',
        category: 'SYSTEM',
        message: err.message,
        details,
        cause: err,
      })
    }
    if (status === 429) {
      return new LlmError({
        code: 'LLM_RATE_LIMITED',
        category: 'THIRD_PARTY',
        message: err.message,
        details,
        cause: err,
      })
    }
    if (typeof status === 'number' && status >= 500) {
      return new LlmError({
        code: 'LLM_SERVER_ERROR',
        category: 'THIRD_PARTY',
        message: err.message,
        details,
        cause: err,
      })
    }
    if (status === 422) {
      return new LlmError({
        code: 'LLM_CONTENT_POLICY',
        category: 'USER',
        message: err.message,
        details,
        cause: err,
      })
    }
    return new LlmError({
      code: 'LLM_TRANSIENT_EXHAUSTED',
      category: 'THIRD_PARTY',
      message: err.message,
      details,
      cause: err,
    })
  }
  if (err instanceof Error && err.name === 'AbortError') {
    throw err
  }
  return new LlmError({
    code: 'LLM_UNKNOWN',
    category: 'SYSTEM',
    message: err instanceof Error ? err.message : String(err),
    details: { provider: providerLabel, model },
    cause: err,
  })
}

export function createOpenAIAdapter(cfg: OpenAIAdapterConfig): ModelAdapter {
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    ...(cfg.baseURL !== undefined ? { baseURL: cfg.baseURL } : {}),
    ...(cfg.defaultHeaders !== undefined ? { defaultHeaders: cfg.defaultHeaders } : {}),
    ...(cfg.organization !== undefined ? { organization: cfg.organization } : {}),
    ...(cfg.project !== undefined ? { project: cfg.project } : {}),
    maxRetries: cfg.maxRetries ?? 2,
    timeout: cfg.timeoutMs ?? 60_000,
  })
  return makeOpenAICompatibleAdapter(client, 'openai')
}

export function makeOpenAICompatibleAdapter(
  client: OpenAI,
  providerLabel: ProviderLabel,
): ModelAdapter {
  return {
    provider: providerLabel,
    async stream(req: AdapterRequest, ctx: RunCtx): Promise<ModelStream<KernelChunk>> {
      const span = startLlmSpan(providerLabel, req.model, ctx.runId)
      span.record({
        estimatedInputTokens: estimateMessagesInputTokens(
          req.messages,
          req.systemPrompt,
          req.model,
        ),
      })

      const wire = kernelToOpenAI(req)
      let sdkStream: ReturnType<OpenAI['chat']['completions']['stream']>
      try {
        sdkStream = client.chat.completions.stream(wire, { signal: ctx.signal })
      } catch (err) {
        const mapped = mapOpenAIError(err, req.model, providerLabel)
        span.record({ errorCode: mapped.code })
        span.end('error', mapped)
        throw mapped
      }

      const state = newOpenAIStreamState()
      let finalUsageRecorded = false

      function recordFinishAttrs(c: Extract<KernelChunk, { type: 'finish' }>) {
        finalUsageRecorded = true
        span.record({
          finishReason: c.reason,
          ...(c.usage !== undefined
            ? {
                inputTokens: c.usage.inputTokens,
                outputTokens: c.usage.outputTokens,
                ...(c.usage.cacheReadInputTokens !== undefined
                  ? { cacheReadInputTokens: c.usage.cacheReadInputTokens }
                  : {}),
              }
            : {}),
        })
      }

      async function* iterate(): AsyncGenerator<KernelChunk> {
        try {
          for await (const chunk of sdkStream) {
            if (ctx.signal.aborted) return
            const chunks = openaiEventToKernelChunks(chunk, state)
            for (const c of chunks) {
              if (c.type === 'finish') recordFinishAttrs(c)
              yield c
            }
          }
          // Flush a pending finish if usage tail was never emitted (defensive).
          const flushed = flushPendingFinish(state)
          for (const c of flushed) {
            if (c.type === 'finish') recordFinishAttrs(c)
            yield c
          }
        } catch (err) {
          if (ctx.signal.aborted) return
          const mapped = mapOpenAIError(err, req.model, providerLabel)
          if (!finalUsageRecorded) span.record({ errorCode: mapped.code })
          span.end('error', mapped)
          throw mapped
        }
      }

      const iter = iterate()

      return {
        [Symbol.asyncIterator]() {
          return iter
        },
        abort() {
          try {
            sdkStream.controller.abort()
          } catch {
            /* swallow */
          }
          if (ctx.signal.aborted) span.end('aborted')
        },
        async finalMessage(): Promise<KernelMessage> {
          try {
            const final = await sdkStream.finalChatCompletion()
            if (!finalUsageRecorded) span.record({ finishReason: 'stop' })
            span.end('ok')
            return openaiFinalToKernelMessage(final)
          } catch (err) {
            if (ctx.signal.aborted) {
              span.end('aborted')
              throw err
            }
            const mapped = mapOpenAIError(err, req.model, providerLabel)
            span.record({ errorCode: mapped.code })
            span.end('error', mapped)
            throw mapped
          }
        },
      }
    },
  }
}
