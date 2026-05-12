import { describe, expect, it } from 'vitest'
import type { AdapterRequest } from '../../types'
import {
  flushPendingFinish,
  kernelToOpenAI,
  newOpenAIStreamState,
  type OpenAIStreamState,
  openaiEventToKernelChunks,
  openaiFinalToKernelMessage,
} from './openai'

describe('kernelToOpenAI', () => {
  it('maps text-only user message with system prompt', () => {
    const out = kernelToOpenAI({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      systemPrompt: 'you are helpful',
      maxTokens: 256,
      cacheTtl: null,
    } as AdapterRequest)
    expect(out.model).toBe('gpt-4o')
    expect(out.stream).toBe(true)
    expect(out.stream_options).toEqual({ include_usage: true })
    expect(out.max_completion_tokens).toBe(256)
    expect((out as { max_tokens?: number }).max_tokens).toBeUndefined()
    expect(out.messages).toEqual([
      { role: 'system', content: 'you are helpful' },
      { role: 'user', content: 'hi' },
    ])
  })

  it('omits max_completion_tokens when not provided', () => {
    const out = kernelToOpenAI({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      cacheTtl: null,
    })
    expect(out.max_completion_tokens).toBeUndefined()
  })

  it('ignores cacheTtl', () => {
    const out = kernelToOpenAI({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      cacheTtl: '5m',
    })
    expect(JSON.stringify(out)).not.toMatch(/cache_control/)
  })

  it('wraps tools as { type: "function", function: { name, description, parameters } }', () => {
    const out = kernelToOpenAI({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      tools: [
        {
          name: 'echo',
          description: 'echo',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      cacheTtl: null,
    })
    expect(out.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'echo',
          description: 'echo',
          parameters: { type: 'object', properties: {} },
        },
      },
    ])
  })

  it('maps assistant tool_use to assistant with tool_calls', () => {
    const out = kernelToOpenAI({
      model: 'gpt-4o',
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
      content: null,
      tool_calls: [
        {
          id: 't1',
          type: 'function',
          function: { name: 'echo', arguments: JSON.stringify({ x: 1 }) },
        },
      ],
    })
  })

  it('maps tool role to a role:tool message with tool_call_id and stringified content', () => {
    const out = kernelToOpenAI({
      model: 'gpt-4o',
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
      role: 'tool',
      tool_call_id: 't1',
      content: JSON.stringify({ ok: true }),
    })
  })
})

function step(events: Array<Parameters<typeof openaiEventToKernelChunks>[0]>) {
  const state: OpenAIStreamState = newOpenAIStreamState()
  const chunks = events.flatMap((e) => openaiEventToKernelChunks(e, state))
  return { chunks, state }
}

describe('openaiEventToKernelChunks', () => {
  it('emits text chunks from delta.content', () => {
    const { chunks } = step([
      {
        id: 'c1',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'gpt-4o',
        choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: null }],
      } as never,
      {
        id: 'c2',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'gpt-4o',
        choices: [{ index: 0, delta: { content: ' world' }, finish_reason: null }],
      } as never,
    ])
    expect(chunks).toEqual([
      { type: 'text', delta: 'hello' },
      { type: 'text', delta: ' world' },
    ])
  })

  it('accumulates tool_call arguments and emits tool_call on finish_reason=tool_calls', () => {
    const { chunks } = step([
      {
        id: 'c1',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 't1',
                  type: 'function',
                  function: { name: 'echo', arguments: '' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      } as never,
      {
        id: 'c2',
        choices: [
          {
            index: 0,
            delta: { tool_calls: [{ index: 0, function: { arguments: '{"x":' } }] },
            finish_reason: null,
          },
        ],
      } as never,
      {
        id: 'c3',
        choices: [
          {
            index: 0,
            delta: { tool_calls: [{ index: 0, function: { arguments: '1}' } }] },
            finish_reason: null,
          },
        ],
      } as never,
      {
        id: 'c4',
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      } as never,
      {
        id: 'c5',
        choices: [],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      } as never,
    ])
    expect(chunks).toEqual([
      { type: 'tool_args', toolCallId: 't1', argsDelta: '' },
      { type: 'tool_args', toolCallId: 't1', argsDelta: '{"x":' },
      { type: 'tool_args', toolCallId: 't1', argsDelta: '1}' },
      { type: 'tool_call', toolCallId: 't1', name: 'echo', args: { x: 1 } },
      { type: 'finish', reason: 'tool_calls', usage: { inputTokens: 5, outputTokens: 3 } },
    ])
  })

  it('emits finish.reason=stop and usage on usage-bearing chunk', () => {
    const { chunks } = step([
      {
        id: 'c1',
        choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }],
      } as never,
      {
        id: 'c2',
        choices: [],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          prompt_tokens_details: { cached_tokens: 2 },
        },
      } as never,
    ])
    expect(chunks).toEqual([
      { type: 'text', delta: 'ok' },
      {
        type: 'finish',
        reason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 2 },
      },
    ])
  })

  it("maps finish_reason='length' and 'content_filter' (with usage tail)", () => {
    const a = step([
      { id: 'x', choices: [{ index: 0, delta: {}, finish_reason: 'length' }] } as never,
      {
        id: 'x-tail',
        choices: [],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      } as never,
    ])
    expect(a.chunks.find((c) => c.type === 'finish')).toMatchObject({
      type: 'finish',
      reason: 'length',
    })

    const b = step([
      { id: 'y', choices: [{ index: 0, delta: {}, finish_reason: 'content_filter' }] } as never,
      {
        id: 'y-tail',
        choices: [],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      } as never,
    ])
    expect(b.chunks.find((c) => c.type === 'finish')).toMatchObject({
      type: 'finish',
      reason: 'error',
    })
  })

  it('flushPendingFinish emits a finish chunk when usage tail was missing', () => {
    const state = newOpenAIStreamState()
    openaiEventToKernelChunks(
      { id: 'x', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] } as never,
      state,
    )
    // No usage tail arrived.
    expect(flushPendingFinish(state)).toEqual([{ type: 'finish', reason: 'stop' }])
    // Idempotent.
    expect(flushPendingFinish(state)).toEqual([])
  })
})

describe('openaiFinalToKernelMessage', () => {
  it('translates an assistant message with text + tool_calls', () => {
    const msg = openaiFinalToKernelMessage({
      id: 'c',
      object: 'chat.completion',
      created: 1,
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'hi',
            tool_calls: [
              {
                id: 't1',
                type: 'function',
                function: { name: 'echo', arguments: JSON.stringify({ x: 1 }) },
              },
            ],
            refusal: null,
          },
          finish_reason: 'tool_calls',
          logprobs: null,
        },
      ],
    } as never)
    expect(msg).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'hi' },
        { type: 'tool_use', toolCallId: 't1', name: 'echo', args: { x: 1 } },
      ],
    })
  })
})
