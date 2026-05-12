import Anthropic from '@anthropic-ai/sdk'
import { LlmError } from '../errors'
import type { AdapterRequest, KernelChunk, KernelMessage, ModelStream, RunCtx } from '../types'
import type { ModelAdapter } from './adapter'
import { startLlmSpan } from './span'
import { estimateMessagesInputTokens } from './tokens'
import {
  anthropicEventToKernelChunks,
  anthropicFinalToKernelMessage,
  kernelToAnthropic,
  newAnthropicStreamState,
} from './translate/anthropic'

export interface AnthropicAdapterConfig {
  apiKey: string
  baseURL?: string
  defaultHeaders?: Record<string, string>
  maxRetries?: number
  timeoutMs?: number
}

function mapAnthropicError(err: unknown, model: string): LlmError {
  if (err instanceof Anthropic.APIError) {
    const status = err.status
    const headers = err.headers as Record<string, string> | undefined
    const requestId = headers?.['request-id'] ?? headers?.['x-request-id']
    const details: Record<string, unknown> = { provider: 'anthropic', model, status }
    if (typeof requestId === 'string') details['requestId'] = requestId

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
    details: { provider: 'anthropic', model },
    cause: err,
  })
}

export function createAnthropicAdapter(cfg: AnthropicAdapterConfig): ModelAdapter {
  const client = new Anthropic({
    apiKey: cfg.apiKey,
    ...(cfg.baseURL !== undefined ? { baseURL: cfg.baseURL } : {}),
    ...(cfg.defaultHeaders !== undefined ? { defaultHeaders: cfg.defaultHeaders } : {}),
    maxRetries: cfg.maxRetries ?? 2,
    timeout: cfg.timeoutMs ?? 60_000,
  })

  return {
    provider: 'anthropic',
    async stream(req: AdapterRequest, ctx: RunCtx): Promise<ModelStream<KernelChunk>> {
      const span = startLlmSpan('anthropic', req.model, ctx.runId)
      span.record({
        estimatedInputTokens: estimateMessagesInputTokens(
          req.messages,
          req.systemPrompt,
          req.model,
        ),
      })

      const wire = kernelToAnthropic(req)
      let sdkStream: ReturnType<typeof client.messages.stream>
      try {
        sdkStream = client.messages.stream({ ...wire } as never, { signal: ctx.signal })
      } catch (err) {
        const mapped = mapAnthropicError(err, req.model)
        span.record({ errorCode: mapped.code })
        span.end('error', mapped)
        throw mapped
      }

      const state = newAnthropicStreamState()
      let finalUsageRecorded = false

      async function* iterate(): AsyncGenerator<KernelChunk> {
        try {
          for await (const event of sdkStream) {
            if (ctx.signal.aborted) return
            const chunks = anthropicEventToKernelChunks(event, state)
            for (const c of chunks) {
              if (c.type === 'finish') {
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
                        ...(c.usage.cacheCreationInputTokens !== undefined
                          ? { cacheCreationInputTokens: c.usage.cacheCreationInputTokens }
                          : {}),
                      }
                    : {}),
                })
              }
              yield c
            }
          }
        } catch (err) {
          if (ctx.signal.aborted) return
          const mapped = mapAnthropicError(err, req.model)
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
            const msg = await sdkStream.finalMessage()
            if (!finalUsageRecorded) {
              span.record({ finishReason: 'stop' })
            }
            span.end('ok')
            return anthropicFinalToKernelMessage(msg)
          } catch (err) {
            if (ctx.signal.aborted) {
              span.end('aborted')
              throw err
            }
            const mapped = mapAnthropicError(err, req.model)
            span.record({ errorCode: mapped.code })
            span.end('error', mapped)
            throw mapped
          }
        },
      }
    },
  }
}
