import { describe, expect, it } from 'vitest'
import { applyAnthropicCacheControl } from './cache-control'

describe('applyAnthropicCacheControl', () => {
  it('returns input unchanged when cacheTtl is null', () => {
    const req = { system: 'sys', tools: [{ name: 't', description: 'd', input_schema: {} }] }
    const out = applyAnthropicCacheControl(req, null)
    expect(out).toEqual(req)
  })

  it("wraps string system into array form with cache_control when cacheTtl is '5m'", () => {
    const req = { system: 'you are helpful' }
    const out = applyAnthropicCacheControl(req, '5m')
    expect(out.system).toEqual([
      {
        type: 'text',
        text: 'you are helpful',
        cache_control: { type: 'ephemeral', ttl: '5m' },
      },
    ])
  })

  it("propagates '1h' ttl onto system", () => {
    const req = { system: 'stable' }
    const out = applyAnthropicCacheControl(req, '1h')
    const blocks = out.system as unknown as Array<{ cache_control: { ttl: string } }>
    expect(blocks[0]?.cache_control.ttl).toBe('1h')
  })

  it('marks only the last tool with cache_control', () => {
    const req = {
      tools: [
        { name: 'a', description: 'a', input_schema: {} },
        { name: 'b', description: 'b', input_schema: {} },
        { name: 'c', description: 'c', input_schema: {} },
      ],
    }
    const out = applyAnthropicCacheControl(req, '5m')
    expect(out.tools![0]).not.toHaveProperty('cache_control')
    expect(out.tools![1]).not.toHaveProperty('cache_control')
    expect(out.tools![2]).toMatchObject({
      cache_control: { type: 'ephemeral', ttl: '5m' },
    })
  })

  it('marks the single tool when only one is present', () => {
    const req = { tools: [{ name: 'a', description: 'a', input_schema: {} }] }
    const out = applyAnthropicCacheControl(req, '5m')
    expect(out.tools![0]).toMatchObject({
      cache_control: { type: 'ephemeral', ttl: '5m' },
    })
  })

  it('handles missing system and missing tools', () => {
    const out = applyAnthropicCacheControl({}, '5m')
    expect(out).toEqual({})
  })

  it('handles already-array system', () => {
    const req = { system: [{ type: 'text' as const, text: 'pre-wrapped' }] }
    const out = applyAnthropicCacheControl(req, '5m')
    expect(out.system).toEqual([
      { type: 'text', text: 'pre-wrapped', cache_control: { type: 'ephemeral', ttl: '5m' } },
    ])
  })
})
