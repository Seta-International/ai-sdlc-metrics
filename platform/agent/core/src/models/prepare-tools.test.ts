import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { Tool } from '../types'
import { prepareTools } from './prepare-tools'

function toolFrom(id: string, inputSchema: z.ZodTypeAny): Tool {
  return {
    id,
    description: 'test',
    inputSchema: inputSchema as unknown as Tool['inputSchema'],
    outputSchema: z.unknown() as unknown as Tool['outputSchema'],
    execute: async () => ({ ok: true, value: undefined }),
  }
}

describe('prepareTools', () => {
  it('returns { name, description, inputSchema } shape', () => {
    const t = toolFrom('list_tasks', z.object({ planId: z.string() }))
    const [out] = prepareTools([t])
    expect(out).toMatchObject({
      name: 'list_tasks',
      description: 'test',
      inputSchema: expect.objectContaining({ type: 'object' }),
    })
  })

  it('pins $schema to draft-07', () => {
    const t = toolFrom('x', z.object({ a: z.string() }))
    const [out] = prepareTools([t])
    expect(out?.inputSchema.$schema).toBe('http://json-schema.org/draft-07/schema#')
  })

  it('repairs typeless properties (z.any() becomes a permissive union)', () => {
    const t = toolFrom('x', z.object({ payload: z.any() }))
    const [out] = prepareTools([t])
    const props = out?.inputSchema.properties as Record<string, { type: unknown }>
    expect(props.payload?.type).toEqual([
      'string',
      'number',
      'integer',
      'boolean',
      'object',
      'null',
    ])
  })

  it('preserves typed properties', () => {
    const t = toolFrom(
      'x',
      z.object({
        name: z.string(),
        count: z.number(),
        active: z.boolean(),
      }),
    )
    const [out] = prepareTools([t])
    const props = out?.inputSchema.properties as Record<string, { type: string }>
    expect(props.name?.type).toBe('string')
    expect(props.count?.type).toBe('number')
    expect(props.active?.type).toBe('boolean')
  })

  it('preserves $ref / anyOf / oneOf / allOf without inserting type', () => {
    const t = toolFrom(
      'x',
      z.object({
        either: z.union([z.string(), z.number()]),
      }),
    )
    const [out] = prepareTools([t])
    const props = out?.inputSchema.properties as Record<string, Record<string, unknown>>
    const either = props.either as Record<string, unknown>
    expect('anyOf' in either || 'oneOf' in either).toBe(true)
    expect((either as { type?: unknown }).type).not.toEqual([
      'string',
      'number',
      'integer',
      'boolean',
      'object',
      'null',
    ])
  })

  it('recurses into nested objects', () => {
    const t = toolFrom(
      'x',
      z.object({
        meta: z.object({
          payload: z.any(),
        }),
      }),
    )
    const [out] = prepareTools([t])
    const meta = (out?.inputSchema.properties as Record<string, Record<string, unknown>>)
      .meta as Record<string, unknown>
    const metaProps = meta.properties as Record<string, { type: unknown }>
    expect(metaProps.payload?.type).toEqual([
      'string',
      'number',
      'integer',
      'boolean',
      'object',
      'null',
    ])
  })

  it('recurses into array items', () => {
    const t = toolFrom('x', z.object({ items: z.array(z.any()) }))
    const [out] = prepareTools([t])
    const items = (out?.inputSchema.properties as Record<string, Record<string, unknown>>)
      .items as Record<string, unknown>
    const inner = items.items as { type: unknown }
    expect(inner.type).toEqual(['string', 'number', 'integer', 'boolean', 'object', 'null'])
  })

  it('handles empty tool array', () => {
    expect(prepareTools([])).toEqual([])
  })
})
