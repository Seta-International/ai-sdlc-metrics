export type AnthropicCacheTtl = '5m' | '1h'

interface SystemTextBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral'; ttl: AnthropicCacheTtl }
}

interface AnthropicToolLike {
  name: string
  description?: string
  input_schema: unknown
  cache_control?: { type: 'ephemeral'; ttl: AnthropicCacheTtl }
}

// Permissive shape that accepts both kernel-built AnthropicRequest and arbitrary
// test fixtures; system may be omitted, a plain string, or an array of blocks.
export function applyAnthropicCacheControl<
  T extends {
    system?: string | SystemTextBlock[]
    tools?: AnthropicToolLike[]
  },
>(req: T, cacheTtl: AnthropicCacheTtl | null): T {
  if (cacheTtl === null) return req

  const out = { ...req } as T & {
    system?: SystemTextBlock[]
    tools?: AnthropicToolLike[]
  }

  if (out.system !== undefined) {
    const blocks: SystemTextBlock[] =
      typeof out.system === 'string'
        ? [{ type: 'text', text: out.system }]
        : out.system.map((b) => ({ ...b }))
    const last = blocks[blocks.length - 1]
    if (last !== undefined) {
      last.cache_control = { type: 'ephemeral', ttl: cacheTtl }
    }
    out.system = blocks
  }

  if (out.tools !== undefined && out.tools.length > 0) {
    const tools = out.tools.map((t) => ({ ...t }))
    const last = tools[tools.length - 1]
    if (last !== undefined) {
      last.cache_control = { type: 'ephemeral', ttl: cacheTtl }
    }
    out.tools = tools
  }

  return out
}
