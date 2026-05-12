import { z } from 'zod'
import type { JsonSchemaTool, Tool } from '../types'

const TYPELESS_UNION = ['string', 'number', 'integer', 'boolean', 'object', 'null'] as const
const DRAFT_07 = 'http://json-schema.org/draft-07/schema#'

function isTypeless(prop: Record<string, unknown>): boolean {
  return (
    !('type' in prop) &&
    !('$ref' in prop) &&
    !('anyOf' in prop) &&
    !('oneOf' in prop) &&
    !('allOf' in prop)
  )
}

function fixNode(node: Record<string, unknown>): Record<string, unknown> {
  if (isTypeless(node)) {
    const { items: _items, ...rest } = node
    return { ...rest, type: [...TYPELESS_UNION] }
  }
  return fixTypelessProperties(node)
}

function fixTypelessProperties(schema: Record<string, unknown>): Record<string, unknown> {
  if (typeof schema !== 'object' || schema === null) return schema
  const result: Record<string, unknown> = { ...schema }

  if (
    result.properties &&
    typeof result.properties === 'object' &&
    !Array.isArray(result.properties)
  ) {
    result.properties = Object.fromEntries(
      Object.entries(result.properties as Record<string, unknown>).map(([key, value]) => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return [key, value]
        }
        return [key, fixNode(value as Record<string, unknown>)]
      }),
    )
  }

  if (result.items) {
    if (Array.isArray(result.items)) {
      result.items = (result.items as Record<string, unknown>[]).map((item) => fixNode(item))
    } else if (typeof result.items === 'object') {
      result.items = fixNode(result.items as Record<string, unknown>)
    }
  }

  return result
}

function pinDraft07(schema: Record<string, unknown>): Record<string, unknown> {
  return { ...schema, $schema: DRAFT_07 }
}

export function prepareTools(tools: Tool[]): JsonSchemaTool[] {
  return tools.map((tool) => {
    const raw = z.toJSONSchema(tool.inputSchema as z.ZodTypeAny) as Record<string, unknown>
    const pinned = pinDraft07(raw)
    const fixed = fixTypelessProperties(pinned)
    return {
      name: tool.id,
      description: tool.description,
      inputSchema: fixed,
    }
  })
}
