import { describe, it, expect } from 'vitest'
import {
  ok,
  tripwire,
  isOk,
  isTripwire,
  enforceFixedDisposition,
  type ToolGatewayResult,
  type TripwireVariant,
} from './tripwire'

describe('ok()', () => {
  it('returns a result with kind: ok', () => {
    const result = ok({ employees: [] }, false)
    expect(result.kind).toBe('ok')
    expect(result.result).toEqual({ employees: [] })
    expect(result.fromCache).toBe(false)
  })

  it('marks fromCache correctly', () => {
    const result = ok('cached-data', true)
    expect(result.fromCache).toBe(true)
  })

  it('produces a frozen object', () => {
    const result = ok({ x: 1 }, false)
    expect(Object.isFrozen(result)).toBe(true)
  })
})

describe('tripwire()', () => {
  it('constructs a tripwire for a non-fixed-disposition variant', () => {
    const result = tripwire('ceiling_breach_bytes', 'retry', { budget_remaining: 500 })
    expect(result.kind).toBe('tripwire')
    expect(result.variant).toBe('ceiling_breach_bytes')
    expect(result.disposition).toBe('retry')
    expect(result.context).toEqual({ budget_remaining: 500 })
  })

  it('produces a frozen object', () => {
    const result = tripwire('ceiling_breach_wallclock', 'abort', {})
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('produces a frozen context object', () => {
    const result = tripwire('validation_failed', 'retry', { field: 'name' })
    expect(Object.isFrozen(result.context)).toBe(true)
  })

  it('allows abort disposition on a non-fixed variant', () => {
    expect(() => tripwire('ceiling_breach_bytes', 'abort', {})).not.toThrow()
  })

  it('allows retry disposition on transient_infra_error', () => {
    expect(() => tripwire('transient_infra_error', 'retry', {})).not.toThrow()
  })
})

describe('enforceFixedDisposition()', () => {
  const fixedAbortVariants: TripwireVariant[] = [
    'permission_denied',
    'permission_denied_disabled',
    'abort_pre_write',
    'procedure_not_agent_exposed',
    'procedure_out_of_sub_agent_scope',
    'business_rule_violation',
    'infra_error',
  ]

  for (const variant of fixedAbortVariants) {
    it(`throws when '${variant}' is given disposition 'retry'`, () => {
      expect(() => enforceFixedDisposition(variant, 'retry')).toThrow(
        `TripwireVariant '${variant}' has a fixed disposition of 'abort'`,
      )
    })

    it(`passes when '${variant}' is given disposition 'abort'`, () => {
      expect(enforceFixedDisposition(variant, 'abort')).toBe('abort')
    })

    it(`tripwire() throws when '${variant}' is constructed with 'retry'`, () => {
      expect(() => tripwire(variant, 'retry', {})).toThrow()
    })
  }

  it('passes for ceiling_breach_bytes with retry', () => {
    expect(enforceFixedDisposition('ceiling_breach_bytes', 'retry')).toBe('retry')
  })

  it('passes for invocation_timeout with retry', () => {
    expect(enforceFixedDisposition('invocation_timeout', 'retry')).toBe('retry')
  })
})

describe('isOk() type predicate', () => {
  it('returns true for ok result', () => {
    const result: ToolGatewayResult = ok(42, false)
    expect(isOk(result)).toBe(true)
  })

  it('returns false for tripwire result', () => {
    const result: ToolGatewayResult = tripwire('validation_failed', 'retry', {})
    expect(isOk(result)).toBe(false)
  })

  it('narrows type correctly (compile-time)', () => {
    const result: ToolGatewayResult = ok({ data: 'x' }, true)
    if (isOk(result)) {
      // TypeScript should allow accessing .result and .fromCache here
      expect(result.result).toBeDefined()
      expect(result.fromCache).toBe(true)
    }
  })
})

describe('isTripwire() type predicate', () => {
  it('returns true for tripwire result', () => {
    const result: ToolGatewayResult = tripwire('ceiling_breach_bytes', 'retry', { remaining: 0 })
    expect(isTripwire(result)).toBe(true)
  })

  it('returns false for ok result', () => {
    const result: ToolGatewayResult = ok(null, false)
    expect(isTripwire(result)).toBe(false)
  })

  it('narrows type correctly (compile-time)', () => {
    const result: ToolGatewayResult = tripwire('infra_error', 'abort', { service: 'db' })
    if (isTripwire(result)) {
      // TypeScript should allow accessing .variant, .disposition, .context here
      expect(result.variant).toBe('infra_error')
      expect(result.disposition).toBe('abort')
      expect(result.context).toEqual({ service: 'db' })
    }
  })
})
