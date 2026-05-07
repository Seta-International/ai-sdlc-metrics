import { describe, it, expect } from 'vitest'
import { runAll, validateName, validateNotReserved } from '../lib/validate'

describe('validation', () => {
  it.each([
    ['Billing', 'kebab-case'],
    ['', 'kebab-case'],
    ['api', 'reserved'],
    ['shell', 'reserved'],
  ])('rejects %s with %s reason', (name, hint) => {
    const v = runAll([validateName(name), validateNotReserved(name)])
    expect(v.ok).toBe(false)
    expect(v.reasons.join(' ')).toMatch(new RegExp(hint))
  })
})
