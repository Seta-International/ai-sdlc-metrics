import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { emit } from './telemetry'

describe('telemetry.emit', () => {
  const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

  beforeEach(() => {
    consoleSpy.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not throw when called in test environment', () => {
    expect(() => emit('test.event', { foo: 'bar' })).not.toThrow()
  })

  it('accepts any name and data', () => {
    expect(() => emit('some.event', null)).not.toThrow()
    expect(() => emit('other', 42)).not.toThrow()
  })
})
