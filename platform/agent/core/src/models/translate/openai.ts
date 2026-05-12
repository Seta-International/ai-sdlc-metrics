import type OpenAI from 'openai'
import type { AdapterRequest, KernelChunk, KernelMessage, TokenUsage } from '../../types'

type ChatMsg = OpenAI.ChatCompletionMessageParam
type Streaming = OpenAI.ChatCompletionCreateParamsStreaming

function textContent(m: KernelMessage): string {
  return m.content
    .filter((c) => c.type === 'text')
    .map((c) => (c as { text: string }).text)
    .join('')
}

function mapKernelMessage(m: KernelMessage): ChatMsg | null {
  if (m.role === 'system') return { role: 'system', content: textContent(m) }
  if (m.role === 'user') return { role: 'user', content: textContent(m) }
  if (m.role === 'tool') {
    const results = m.content.filter((c) => c.type === 'tool_result') as Array<{
      toolCallId: string
      result: unknown
    }>
    if (results.length === 0) return null
    const r = results[0]
    if (r === undefined) return null
    return {
      role: 'tool',
      tool_call_id: r.toolCallId,
      content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result ?? null),
    }
  }
  // assistant
  const toolUses = m.content.filter((c) => c.type === 'tool_use') as Array<{
    toolCallId: string
    name: string
    args: unknown
  }>
  const text = textContent(m)
  if (toolUses.length > 0) {
    return {
      role: 'assistant',
      content: text.length > 0 ? text : null,
      tool_calls: toolUses.map((tu) => ({
        id: tu.toolCallId,
        type: 'function' as const,
        function: { name: tu.name, arguments: JSON.stringify(tu.args ?? {}) },
      })),
    }
  }
  return { role: 'assistant', content: text }
}

export function kernelToOpenAI(req: AdapterRequest): Streaming {
  const messages: ChatMsg[] = []
  if (req.systemPrompt !== undefined && req.systemPrompt.length > 0) {
    messages.push({ role: 'system', content: req.systemPrompt })
  }
  for (const m of req.messages) {
    const mapped = mapKernelMessage(m)
    if (mapped !== null) messages.push(mapped)
  }

  const tools: Streaming['tools'] =
    req.tools !== undefined && req.tools.length > 0
      ? req.tools.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description ?? '',
            parameters: t.inputSchema as Record<string, unknown>,
          },
        }))
      : undefined

  return {
    model: req.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(req.maxTokens !== undefined ? { max_completion_tokens: req.maxTokens } : {}),
    ...(tools !== undefined ? { tools } : {}),
  }
}

export interface OpenAIStreamState {
  toolByIndex: Map<number, { id: string; name: string; args: string; emittedCall: boolean }>
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error' | null
  usage: TokenUsage | null
}

export function newOpenAIStreamState(): OpenAIStreamState {
  return { toolByIndex: new Map(), finishReason: null, usage: null }
}

function mapFinishReason(r: string | null | undefined): 'stop' | 'tool_calls' | 'length' | 'error' {
  switch (r) {
    case 'stop':
      return 'stop'
    case 'tool_calls':
      return 'tool_calls'
    case 'length':
      return 'length'
    default:
      return 'error'
  }
}

export function openaiEventToKernelChunks(
  chunk: OpenAI.ChatCompletionChunk,
  state: OpenAIStreamState,
): KernelChunk[] {
  const out: KernelChunk[] = []

  for (const choice of chunk.choices ?? []) {
    const delta = choice.delta ?? {}

    if (typeof delta.content === 'string' && delta.content.length > 0) {
      out.push({ type: 'text', delta: delta.content })
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0
        let entry = state.toolByIndex.get(idx)
        if (entry === undefined) {
          entry = {
            id: tc.id ?? '',
            name: tc.function?.name ?? '',
            args: '',
            emittedCall: false,
          }
          state.toolByIndex.set(idx, entry)
        } else {
          if (tc.id !== undefined) entry.id = tc.id
          if (tc.function?.name !== undefined) entry.name = tc.function.name
        }
        const argsDelta = tc.function?.arguments ?? ''
        entry.args += argsDelta
        out.push({ type: 'tool_args', toolCallId: entry.id, argsDelta })
      }
    }

    if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
      state.finishReason = mapFinishReason(choice.finish_reason)
      if (state.finishReason === 'tool_calls') {
        for (const entry of state.toolByIndex.values()) {
          if (entry.emittedCall) continue
          entry.emittedCall = true
          let parsed: unknown = {}
          if (entry.args.length > 0) {
            try {
              parsed = JSON.parse(entry.args)
            } catch {
              parsed = { __unparsedJson: entry.args }
            }
          }
          out.push({
            type: 'tool_call',
            toolCallId: entry.id,
            name: entry.name,
            args: parsed,
          })
        }
      }
    }
  }

  if (chunk.usage !== null && chunk.usage !== undefined) {
    const u = chunk.usage
    const usage: TokenUsage = {
      inputTokens: u.prompt_tokens ?? 0,
      outputTokens: u.completion_tokens ?? 0,
    }
    const cached = (u as { prompt_tokens_details?: { cached_tokens?: number } })
      .prompt_tokens_details?.cached_tokens
    if (typeof cached === 'number') usage.cacheReadInputTokens = cached
    state.usage = usage
  }

  // With stream_options.include_usage:true (which our adapter always sets), OpenAI
  // sends finish_reason in one chunk and usage in a separate tail chunk. We defer
  // the finish chunk until both are seen so consumers get a single, complete event.
  if (state.finishReason !== null && state.usage !== null) {
    out.push({ type: 'finish', reason: state.finishReason, usage: state.usage })
    state.finishReason = null
    state.usage = null
  }

  return out
}

// Flushes a pending finish if the stream ended without a usage tail (defensive —
// some OpenAI-compatible proxies omit usage even when include_usage is true).
export function flushPendingFinish(state: OpenAIStreamState): KernelChunk[] {
  if (state.finishReason === null) return []
  const reason = state.finishReason
  state.finishReason = null
  return [{ type: 'finish', reason }]
}

export function openaiFinalToKernelMessage(msg: OpenAI.ChatCompletion): KernelMessage {
  const choice = msg.choices[0]
  if (choice === undefined) return { role: 'assistant', content: [] }
  const m = choice.message
  const content: KernelMessage['content'] = []
  if (typeof m.content === 'string' && m.content.length > 0) {
    content.push({ type: 'text', text: m.content })
  }
  if (Array.isArray(m.tool_calls)) {
    for (const tc of m.tool_calls) {
      if (tc.type !== 'function') continue
      let args: unknown = {}
      try {
        args = tc.function.arguments.length > 0 ? JSON.parse(tc.function.arguments) : {}
      } catch {
        args = { __unparsedJson: tc.function.arguments }
      }
      content.push({ type: 'tool_use', toolCallId: tc.id, name: tc.function.name, args })
    }
  }
  return { role: 'assistant', content }
}
