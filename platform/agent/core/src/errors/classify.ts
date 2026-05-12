export type ErrorClass = 'transient' | 'terminal'

const TRANSIENT_HTTP = new Set([408, 429, 500, 502, 503, 504])
const TRANSIENT_NODE_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
])

export function classifyError(err: unknown): ErrorClass {
  if (typeof err !== 'object' || err === null) return 'terminal'
  const e = err as Record<string, unknown>
  const status = typeof e.status === 'number' ? e.status : undefined
  if (status !== undefined && TRANSIENT_HTTP.has(status)) return 'transient'
  const code = typeof e.code === 'string' ? e.code : undefined
  if (code !== undefined && TRANSIENT_NODE_CODES.has(code)) return 'transient'
  return 'terminal'
}

export function isAbortError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'name' in err) {
    if ((err as { name: unknown }).name === 'AbortError') return true
  }
  return false
}
