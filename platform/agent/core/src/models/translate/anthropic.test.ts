import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import type { AdapterRequest } from '../../types'
import {
  type AnthropicStreamState,
  anthropicEventToKernelChunks,
  anthropicFinalToKernelMessage,
  kernelToAnthropic,
  newAnthropicStreamState,
} from './anthropic'

describe('kernelToAnthropic', () => {
  it('maps text-only user message and system prompt', () => {
    const req: AdapterRequest = {
      model: 'claude-4-7-sonnet',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      systemPrompt: 'you are helpful',
      maxTokens: 1024,
      cacheTtl: null,
    }
    const out = kernelToAnthropic(req)
    expect(out.model).toBe('claude-4-7-sonnet')
    expect(out.max_tokens).toBe(1024)
    expect(out.system).toBe('you are helpful')
    expect(out.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'hello' }] }])
  })

  it('defaults max_tokens to 4096 when omitted', () => {
    const out = kernelToAnthropic({
      model: 'claude-4-7-sonnet',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      cacheTtl: null,
    })
    expect(out.max_tokens).toBe(4096)
  })

  it("applies cache_control when cacheTtl is '5m'", () => {
    const out = kernelToAnthropic({
      model: 'claude-4-7-sonnet',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      systemPrompt: 'system text',
      cacheTtl: '5m',
      tools: [
        {
          name: 'echo',
          description: 'echo',
          inputSchema: {
            type: 'object',
            properties: {},
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
      ],
    })
    expect(out.system).toEqual([
      {
        type: 'text',
        text: 'system text',
        cache_control: { type: 'ephemeral', ttl: '5m' },
      },
    ])
    expect(out.tools?.[0]).toMatchObject({
      name: 'echo',
      input_schema: expect.any(Object),
      cache_control: { type: 'ephemeral', ttl: '5m' },
    })
  })

  it('strips kernel system role messages and joins with top-level systemPrompt', () => {
    const out = kernelToAnthropic({
      model: 'claude-4-7-sonnet',
      systemPrompt: 'header',
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'inline-system' }] },
        { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      ],
      cacheTtl: null,
    })
    expect(out.system).toBe('header\ninline-system')
    expect(out.messages).toHaveLength(1)
    expect(out.messages[0]?.role).toBe('user')
  })

  it('maps assistant tool_use to anthropic content block', () => {
    const out = kernelToAnthropic({
      model: 'claude-4-7-sonnet',
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', toolCallId: 't1', name: 'echo', args: { x: 1 } }],
        },
      ],
      cacheTtl: null,
    })
    expect(out.messages[0]).toEqual({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 't1', name: 'echo', input: { x: 1 } }],
    })
  })

  it('maps tool role with tool_result to user message with anthropic tool_result block', () => {
    const out = kernelToAnthropic({
      model: 'claude-4-7-sonnet',
      messages: [
        {
          role: 'tool',
          toolCallId: 't1',
          content: [{ type: 'tool_result', toolCallId: 't1', result: { ok: true } }],
        },
      ],
      cacheTtl: null,
    })
    expect(out.messages[0]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 't1',
          content: JSON.stringify({ ok: true }),
        },
      ],
    })
  })

  it('marks tool_result with is_error: true when content carries isError', () => {
    const out = kernelToAnthropic({
      model: 'claude-4-7-sonnet',
      messages: [
        {
          role: 'tool',
          toolCallId: 't1',
          content: [{ type: 'tool_result', toolCallId: 't1', result: 'oops', isError: true }],
        },
      ],
      cacheTtl: null,
    })
    expect(out.messages[0]?.content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 't1',
      is_error: true,
    })
  })
})

describe('anthropicEventToKernelChunks', () => {
  function step(events: Anthropic.MessageStreamEvent[]) {
    const state: AnthropicStreamState = newAnthropicStreamState()
    const chunks = events.flatMap((e) => anthropicEventToKernelChunks(e, state))
    return { state, chunks }
  }

  it('emits text chunks from content_block_delta text_delta', () => {
    const { chunks } = step([
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      } as never,
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'hello' },
      } as never,
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: ' world' },
      } as never,
      { type: 'content_block_stop', index: 0 } as never,
    ])
    expect(chunks).toEqual([
      { type: 'text', delta: 'hello' },
      { type: 'text', delta: ' world' },
    ])
  })

  it('accumulates tool_use input_json_delta and emits tool_call on content_block_stop', () => {
    const { chunks } = step([
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 't1', name: 'echo', input: {} },
      } as never,
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"x":' },
      } as never,
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '1}' },
      } as never,
      { type: 'content_block_stop', index: 0 } as never,
    ])
    expect(chunks).toEqual([
      { type: 'tool_args', toolCallId: 't1', argsDelta: '{"x":' },
      { type: 'tool_args', toolCallId: 't1', argsDelta: '1}' },
      { type: 'tool_call', toolCallId: 't1', name: 'echo', args: { x: 1 } },
    ])
  })

  it('emits finish on message_stop with mapped stop_reason and usage', () => {
    const { chunks } = step([
      {
        type: 'message_start',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-4-7-sonnet',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      } as never,
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 2,
          cache_creation_input_tokens: 0,
        },
      } as never,
      { type: 'message_stop' } as never,
    ])
    expect(chunks).toEqual([
      {
        type: 'finish',
        reason: 'stop',
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheReadInputTokens: 2,
          cacheCreationInputTokens: 0,
        },
      },
    ])
  })

  it('maps stop_reason=tool_use to finish.reason="tool_calls"', () => {
    const { chunks } = step([
      {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use', stop_sequence: null },
        usage: { input_tokens: 1, output_tokens: 1 },
      } as never,
      { type: 'message_stop' } as never,
    ])
    expect(chunks[0]).toMatchObject({ type: 'finish', reason: 'tool_calls' })
  })

  it('maps stop_reason=max_tokens to finish.reason="length"', () => {
    const { chunks } = step([
      {
        type: 'message_delta',
        delta: { stop_reason: 'max_tokens', stop_sequence: null },
        usage: { input_tokens: 1, output_tokens: 1 },
      } as never,
      { type: 'message_stop' } as never,
    ])
    expect(chunks[0]).toMatchObject({ type: 'finish', reason: 'length' })
  })
})

describe('anthropicFinalToKernelMessage', () => {
  it('translates a final assistant message with text + tool_use blocks', () => {
    const msg = anthropicFinalToKernelMessage({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-4-7-sonnet',
      content: [
        { type: 'text', text: 'hello' },
        { type: 'tool_use', id: 't1', name: 'echo', input: { x: 1 } },
      ],
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    } as never)
    expect(msg).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'hello' },
        { type: 'tool_use', toolCallId: 't1', name: 'echo', args: { x: 1 } },
      ],
    })
  })
})
