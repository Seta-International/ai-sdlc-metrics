import crypto from 'node:crypto'

function canonicalizeISODateString(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return value
  return new Date(value).toISOString()
}

function stableSortKeys(value: unknown): unknown {
  if (typeof value === 'string') return canonicalizeISODateString(value)
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(stableSortKeys)
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = stableSortKeys((value as Record<string, unknown>)[key])
  }
  return sorted
}

function normalizeRequestBody(body: unknown): unknown {
  if (typeof body === 'string') return canonicalizeISODateString(body)
  if (body !== null && typeof body === 'object') return stableSortKeys(body)
  return body
}

export function serializeRequestContent(url: string, body: unknown): string {
  const normalized = normalizeRequestBody(body)
  return `${url}:${typeof normalized === 'string' ? normalized : JSON.stringify(normalized)}`
}

export function hashRequest(url: string, body: unknown): string {
  return crypto
    .createHash('md5')
    .update(serializeRequestContent(url, body))
    .digest('hex')
    .slice(0, 16)
}
