import { describe, expect, it } from 'vitest'
import { classifyError, isAbortError } from './classify'

describe('classifyError', () => {
  it.each([429, 500, 502, 503, 504, 408])('HTTP %i maps to transient', (status) => {
    expect(classifyError({ status })).toBe('transient')
  })

  it.each([400, 401, 403, 404, 422])('HTTP %i maps to terminal', (status) => {
    expect(classifyError({ status })).toBe('terminal')
  })

  it.each([
    'ECONNRESET',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
  ])('Node error code %s maps to transient', (code) => {
    expect(classifyError({ code })).toBe('transient')
  })

  it('AbortError maps to terminal (caller handles abort separately)', () => {
    const e = new Error('aborted')
    e.name = 'AbortError'
    expect(classifyError(e)).toBe('terminal')
  })

  it('TypeError maps to terminal', () => {
    expect(classifyError(new TypeError('bad'))).toBe('terminal')
  })

  it('null, undefined, and strings map to terminal', () => {
    expect(classifyError(null)).toBe('terminal')
    expect(classifyError(undefined)).toBe('terminal')
    expect(classifyError('boom')).toBe('terminal')
  })
})

describe('isAbortError', () => {
  it('detects errors named AbortError', () => {
    const e = new Error('aborted')
    e.name = 'AbortError'
    expect(isAbortError(e)).toBe(true)
  })

  it('detects the abort reason on a signaled controller', () => {
    const ctrl = new AbortController()
    ctrl.abort()
    expect(isAbortError(ctrl.signal.reason)).toBe(true)
  })

  it('returns false for plain errors', () => {
    expect(isAbortError(new Error('not abort'))).toBe(false)
  })

  it('returns false for non-Error values', () => {
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError('string')).toBe(false)
  })
})
