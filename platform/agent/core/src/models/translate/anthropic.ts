import type Anthropic from '@anthropic-ai/sdk'
import type { AdapterRequest, KernelChunk, KernelMessage, KernelMessageContent } from '../../types'
import { applyAnthropicCacheControl } from '../cache-control'

const DEFAULT_MAX_TOKENS = 4096

type AnthropicMessageParam = Anthropic.MessageCreateParams['messages'][number]
type AnthropicSystem = Anthropic.MessageCreateParams['system']
type AnthropicTool = NonNullable<Anthropic.MessageCreateParams['tools']>[number]

export interface AnthropicRequest {
  model: string
  max_tokens: number
  system?: AnthropicSystem
  tools?: AnthropicTool[]
  messages: AnthropicMessageParam[]
}

function partitionSystem(messages: KernelMessage[]): {
  inlineSystem: string[]
  rest: KernelMessage[]
} {
  const inlineSystem: string[] = []
  const rest: KernelMessage[] = []
  for (const m of messages) {
    if (m.role === 'system') {
      for (const c of m.content) {
        if (c.type === 'text') inlineSystem.push(c.text)
      }
    } else {
      rest.push(m)
    }
  }
  return { inlineSystem, rest }
}

function mapKernelContentToAnthropic(c: KernelMessageContent) {
  switch (c.type) {
    case 'text':
      return { type: 'text' as const, text: c.text }
    case 'tool_use':
      return {
        type: 'tool_use' as const,
        id: c.toolCallId,
        name: c.name,
        input: (c.args ?? {}) as Record<string, unknown>,
      }
    case 'tool_result': {
      const content = typeof c.result === 'string' ? c.result : JSON.stringify(c.result ?? null)
      return {
        type: 'tool_result' as const,
        tool_use_id: c.toolCallId,
        content,
        ...(c.isError === true ? { is_error: true as const } : {}),
      }
    }
  }
}

function mapKernelMessage(m: KernelMessage): AnthropicMessageParam {
  if (m.role === 'tool') {
    return {
      role: 'user',
      content: m.content.map(mapKernelContentToAnthropic) as never,
    }
  }
  if (m.role === 'user' || m.role === 'assistant') {
    return {
      role: m.role,
      content: m.content.map(mapKernelContentToAnthropic) as never,
    }
  }
  throw new Error(`unexpected role: ${m.role as string}`)
}

export function kernelToAnthropic(req: AdapterRequest): AnthropicRequest {
  const { inlineSystem, rest } = partitionSystem(req.messages)
  const systemParts: string[] = []
  if (req.systemPrompt !== undefined && req.systemPrompt.length > 0) {
    systemParts.push(req.systemPrompt)
  }
  systemParts.push(...inlineSystem)
  const system: AnthropicRequest['system'] | undefined =
    systemParts.length > 0 ? systemParts.join('\n') : undefined

  const tools: AnthropicTool[] | undefined =
    req.tools !== undefined && req.tools.length > 0
      ? req.tools.map((t) => ({
          name: t.name,
          description: t.description ?? '',
          input_schema: t.inputSchema as never,
        }))
      : undefined

  const cacheable = applyAnthropicCacheControl(
    {
      ...(system !== undefined ? { system } : {}),
      ...(tools !== undefined ? { tools } : {}),
    } as Parameters<typeof applyAnthropicCacheControl>[0],
    req.cacheTtl ?? null,
  )

  return {
    model: req.model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...(cacheable.system !== undefined ? { system: cacheable.system as never } : {}),
    ...(cacheable.tools !== undefined ? { tools: cacheable.tools as never } : {}),
    messages: rest.map(mapKernelMessage),
  }
}

export interface AnthropicStreamState {
  toolByIndex: Map<number, { id: string; name: string; args: string }>
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error' | null
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens?: number
    cacheCreationInputTokens?: number
  } | null
}

export function newAnthropicStreamState(): AnthropicStreamState {
  return { toolByIndex: new Map(), finishReason: null, usage: null }
}

function mapStopReason(r: string | null | undefined): 'stop' | 'tool_calls' | 'length' | 'error' {
  switch (r) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop'
    case 'tool_use':
      return 'tool_calls'
    case 'max_tokens':
      return 'length'
    default:
      return 'error'
  }
}

export function anthropicEventToKernelChunks(
  event: Anthropic.MessageStreamEvent,
  state: AnthropicStreamState,
): KernelChunk[] {
  switch (event.type) {
    case 'message_start':
      state.usage = {
        inputTokens: event.message.usage?.input_tokens ?? 0,
        outputTokens: event.message.usage?.output_tokens ?? 0,
      }
      return []

    case 'content_block_start': {
      const block = event.content_block as { type: string; id?: string; name?: string }
      if (block.type === 'tool_use') {
        state.toolByIndex.set(event.index, {
          id: block.id ?? '',
          name: block.name ?? '',
          args: '',
        })
      }
      return []
    }

    case 'content_block_delta': {
      const d = event.delta as { type: string; text?: string; partial_json?: string }
      if (d.type === 'text_delta' && typeof d.text === 'string') {
        return [{ type: 'text', delta: d.text }]
      }
      if (d.type === 'input_json_delta' && typeof d.partial_json === 'string') {
        const tool = state.toolByIndex.get(event.index)
        if (!tool) return []
        tool.args += d.partial_json
        return [{ type: 'tool_args', toolCallId: tool.id, argsDelta: d.partial_json }]
      }
      return []
    }

    case 'content_block_stop': {
      const tool = state.toolByIndex.get(event.index)
      if (!tool) return []
      let parsed: unknown = {}
      if (tool.args.length > 0) {
        try {
          parsed = JSON.parse(tool.args)
        } catch {
          parsed = { __unparsedJson: tool.args }
        }
      }
      return [{ type: 'tool_call', toolCallId: tool.id, name: tool.name, args: parsed }]
    }

    case 'message_delta': {
      const d = event.delta as { stop_reason?: string | null }
      state.finishReason = mapStopReason(d.stop_reason)
      const u = (
        event as {
          usage?: {
            input_tokens?: number
            output_tokens?: number
            cache_read_input_tokens?: number
            cache_creation_input_tokens?: number
          }
        }
      ).usage
      if (u !== undefined && state.usage !== null) {
        if (typeof u.input_tokens === 'number') state.usage.inputTokens = u.input_tokens
        if (typeof u.output_tokens === 'number') state.usage.outputTokens = u.output_tokens
        if (typeof u.cache_read_input_tokens === 'number') {
          state.usage.cacheReadInputTokens = u.cache_read_input_tokens
        }
        if (typeof u.cache_creation_input_tokens === 'number') {
          state.usage.cacheCreationInputTokens = u.cache_creation_input_tokens
        }
      }
      return []
    }

    case 'message_stop': {
      const reason = state.finishReason ?? 'stop'
      const usage = state.usage ?? undefined
      return [{ type: 'finish', reason, ...(usage !== undefined ? { usage } : {}) }]
    }

    default:
      return []
  }
}

export function anthropicFinalToKernelMessage(msg: Anthropic.Message): KernelMessage {
  const content: KernelMessage['content'] = []
  for (const b of msg.content) {
    if (b.type === 'text') {
      content.push({ type: 'text', text: b.text })
    } else if (b.type === 'tool_use') {
      content.push({
        type: 'tool_use',
        toolCallId: b.id,
        name: b.name,
        args: b.input as unknown,
      })
    }
    // Thinking, redacted_thinking, server_tool_use, etc. have no kernel equivalent
    // and are intentionally dropped from the canonical message form.
  }
  return { role: 'assistant', content }
}
