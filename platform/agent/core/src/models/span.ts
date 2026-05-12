import { type Span, SpanStatusCode, trace } from '@opentelemetry/api'
import { tenantContext } from '@seta/tenant'

const tracer = trace.getTracer('@seta/agent-core')

export interface LlmSpanAttrs {
  estimatedInputTokens: number
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error'
  errorCode: string
  aborted: boolean
}

export interface LlmSpanHandle {
  record(attrs: Partial<LlmSpanAttrs>): void
  end(status: 'ok' | 'error' | 'aborted', err?: unknown): void
}

function readTenantId(): string | undefined {
  try {
    return tenantContext.getTenantId()
  } catch {
    return undefined
  }
}

const attrKey: Record<keyof LlmSpanAttrs, string> = {
  estimatedInputTokens: 'llm.estimated_input_tokens',
  inputTokens: 'llm.input_tokens',
  outputTokens: 'llm.output_tokens',
  cacheReadInputTokens: 'llm.cache_read_input_tokens',
  cacheCreationInputTokens: 'llm.cache_creation_input_tokens',
  finishReason: 'llm.finish_reason',
  errorCode: 'llm.error_code',
  aborted: 'llm.aborted',
}

export function startLlmSpan(provider: string, model: string, runId: string): LlmSpanHandle {
  const span: Span = tracer.startSpan(`llm.${provider}.stream`)
  span.setAttribute('llm.provider', provider)
  span.setAttribute('llm.model', model)
  span.setAttribute('run.id', runId)
  const tenantId = readTenantId()
  if (tenantId !== undefined) span.setAttribute('tenant.id', tenantId)

  let closed = false

  return {
    record(attrs) {
      if (closed) return
      for (const [k, v] of Object.entries(attrs) as Array<[keyof LlmSpanAttrs, unknown]>) {
        if (v === undefined) continue
        span.setAttribute(attrKey[k], v as never)
      }
    },
    end(status, err) {
      if (closed) return
      closed = true
      if (status === 'error') {
        if (err instanceof Error) span.recordException(err)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err ?? 'error'),
        })
      } else if (status === 'aborted') {
        span.setAttribute('llm.aborted', true)
        span.setStatus({ code: SpanStatusCode.OK })
      } else {
        span.setStatus({ code: SpanStatusCode.OK })
      }
      span.end()
    },
  }
}
