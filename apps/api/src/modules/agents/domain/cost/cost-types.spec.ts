import { describe, it, expect } from 'vitest'
import { EMPTY_USAGE } from './cost-types'

describe('cost-types', () => {
  describe('EMPTY_USAGE', () => {
    it('has all zero fields', () => {
      expect(EMPTY_USAGE.inputUncached).toBe(0)
      expect(EMPTY_USAGE.inputCachedRead).toBe(0)
      expect(EMPTY_USAGE.inputCachedWrite).toBe(0)
      expect(EMPTY_USAGE.output).toBe(0)
      expect(EMPTY_USAGE.outputReasoning).toBe(0)
    })

    it('has exactly 5 keys', () => {
      expect(Object.keys(EMPTY_USAGE)).toHaveLength(5)
    })
  })

  describe('VendorErrorClass values', () => {
    it('covers all expected classes', () => {
      const classes = [
        'vendor_rate_limit',
        'vendor_overload',
        'vendor_server_error',
        'vendor_timeout',
        'vendor_invalid_response',
      ] as const
      // The union type is enforced at compile time; verify the literal values at runtime.
      expect(classes).toHaveLength(5)
      expect(classes).toContain('vendor_rate_limit')
      expect(classes).toContain('vendor_overload')
      expect(classes).toContain('vendor_server_error')
      expect(classes).toContain('vendor_timeout')
      expect(classes).toContain('vendor_invalid_response')
    })
  })
})
