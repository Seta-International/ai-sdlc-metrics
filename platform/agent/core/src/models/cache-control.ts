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

interface CacheableRequest {
  system?: string | SystemTextBlock[]
  tools?: AnthropicToolLike[]
}

export function applyAnthropicCacheControl<T extends CacheableRequest>(
  req: T,
  cacheTtl: AnthropicCacheTtl | null,
): T {
  if (cacheTtl === null) return req

  const out: CacheableRequest = { ...req }

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

  return out as T
}
