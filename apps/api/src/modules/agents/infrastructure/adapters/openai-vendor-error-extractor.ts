import { VendorError } from '../../domain/cost/cost-types'

export class OpenAiVendorErrorExtractor {
  extract(providerResponse: unknown): VendorError | null {
    const err = providerResponse as Record<string, unknown>

    const status =
      typeof err['status'] === 'number'
        ? err['status']
        : typeof err['statusCode'] === 'number'
          ? err['statusCode']
          : null

    const message: string =
      typeof err['message'] === 'string' ? err['message'] : String(providerResponse)

    const name: string = typeof err['name'] === 'string' ? err['name'] : ''
    const code: string = typeof err['code'] === 'string' ? err['code'] : ''

    const vendorMessage = message

    // Rate limit
    if (status === 429) {
      const headers = isObject(err['headers']) ? (err['headers'] as Record<string, unknown>) : null
      let retryAfterMs: number | undefined

      if (headers) {
        const retryAfterHeader = headers['retry-after']
        if (typeof retryAfterHeader === 'string' && retryAfterHeader.trim() !== '') {
          const seconds = parseFloat(retryAfterHeader)
          if (!isNaN(seconds)) {
            retryAfterMs = seconds * 1000
          } else {
            // Try ISO timestamp
            const ts = Date.parse(retryAfterHeader)
            if (!isNaN(ts)) {
              retryAfterMs = Math.max(0, ts - Date.now())
            }
          }
        }

        // Anthropic unified reset
        if (retryAfterMs === undefined) {
          const anthropicReset = headers['anthropic-ratelimit-unified-reset']
          if (typeof anthropicReset === 'string') {
            const ts = Date.parse(anthropicReset)
            if (!isNaN(ts)) {
              retryAfterMs = Math.max(0, ts - Date.now())
            }
          }
        }
      }

      let resetAt: Date | undefined
      if (headers) {
        const resetHeader =
          headers['x-ratelimit-reset-requests'] ?? headers['x-ratelimit-reset-tokens']
        if (typeof resetHeader === 'string') {
          const ts = Date.parse(resetHeader)
          if (!isNaN(ts)) resetAt = new Date(ts)
        }
      }

      return { class: 'vendor_rate_limit', retryAfterMs, resetAt, vendorMessage }
    }

    // Overload
    if (status === 529 || /overloaded|capacity/i.test(message)) {
      return { class: 'vendor_overload', vendorMessage }
    }

    // Server error
    if (status === 500 || status === 502 || status === 503) {
      return { class: 'vendor_server_error', vendorMessage }
    }

    // Timeout
    if (code === 'ETIMEDOUT' || name === 'TimeoutError' || /timeout/i.test(message)) {
      return { class: 'vendor_timeout', vendorMessage }
    }

    // Invalid response
    if (name === 'SyntaxError' || /json|parse|unexpected token/i.test(message)) {
      return { class: 'vendor_invalid_response', vendorMessage }
    }

    return null
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
