import { OpenAiVendorErrorExtractor } from './openai-vendor-error-extractor'

describe('OpenAiVendorErrorExtractor', () => {
  const extractor = new OpenAiVendorErrorExtractor()

  it('HTTP 429 without retry-after → vendor_rate_limit, no retryAfterMs', () => {
    const err = Object.assign(new Error('Rate limit exceeded'), { status: 429 })
    const result = extractor.extract(err)

    expect(result).not.toBeNull()
    expect(result!.class).toBe('vendor_rate_limit')
    expect(result!.retryAfterMs).toBeUndefined()
  })

  it('HTTP 429 with retry-after: 30 → vendor_rate_limit, retryAfterMs: 30000', () => {
    const err = Object.assign(new Error('Rate limit exceeded'), {
      status: 429,
      headers: { 'retry-after': '30' },
    })
    const result = extractor.extract(err)

    expect(result).not.toBeNull()
    expect(result!.class).toBe('vendor_rate_limit')
    expect(result!.retryAfterMs).toBe(30000)
  })

  it('HTTP 529 → vendor_overload', () => {
    const err = Object.assign(new Error('Service overloaded'), { status: 529 })
    const result = extractor.extract(err)

    expect(result).not.toBeNull()
    expect(result!.class).toBe('vendor_overload')
  })

  it('error message contains "overloaded" → vendor_overload', () => {
    const err = new Error('The server is overloaded or not ready yet')
    const result = extractor.extract(err)

    expect(result).not.toBeNull()
    expect(result!.class).toBe('vendor_overload')
  })

  it('HTTP 500 → vendor_server_error', () => {
    const err = Object.assign(new Error('Internal server error'), { status: 500 })
    const result = extractor.extract(err)

    expect(result).not.toBeNull()
    expect(result!.class).toBe('vendor_server_error')
  })

  it('timeout error (name=TimeoutError) → vendor_timeout', () => {
    const err = new Error('Request timed out')
    err.name = 'TimeoutError'
    const result = extractor.extract(err)

    expect(result).not.toBeNull()
    expect(result!.class).toBe('vendor_timeout')
  })

  it('SyntaxError (JSON parse failure) → vendor_invalid_response', () => {
    const err = new SyntaxError('Unexpected token < in JSON at position 0')
    const result = extractor.extract(err)

    expect(result).not.toBeNull()
    expect(result!.class).toBe('vendor_invalid_response')
  })

  it('unclassified error → returns null', () => {
    const err = new Error('Something unexpected happened')
    const result = extractor.extract(err)

    expect(result).toBeNull()
  })

  it('vendorMessage is always set from error.message', () => {
    const err = Object.assign(new Error('Rate limit exceeded'), { status: 429 })
    const result = extractor.extract(err)

    expect(result!.vendorMessage).toBe('Rate limit exceeded')
  })
})
