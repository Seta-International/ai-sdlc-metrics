import { describe, it, expect } from 'vitest'
import {
  validateName,
  validateNotReserved,
  validateModuleDoesNotExist,
  validateZoneDoesNotExist,
  validateModuleExists,
} from './validate'
import { createTree } from './tree'

describe('validateName', () => {
  it.each([
    ['billing', true],
    ['billing-item', true],
    ['Billing', false],
    ['', false],
    ['1abc', false],
  ])('%s -> %s', (n, ok) => expect(validateName(n).ok).toBe(ok))
})

describe('validateNotReserved', () => {
  it.each([
    ['api', false],
    ['shell', false],
    ['default', false],
    ['billing', true],
  ])('%s -> %s', (n, ok) => expect(validateNotReserved(n).ok).toBe(ok))
})

describe('validateModuleDoesNotExist', () => {
  it('passes when module folder absent', () => {
    const tree = createTree('/repo')
    expect(validateModuleDoesNotExist(tree, 'billing').ok).toBe(true)
  })

  it('fails when module folder exists in seed', () => {
    const tree = createTree('/repo', {
      seed: { 'apps/api/src/modules/billing/billing.module.ts': 'x' },
    })
    expect(validateModuleDoesNotExist(tree, 'billing').ok).toBe(false)
  })
})

describe('validateZoneDoesNotExist', () => {
  it('fails when web-<name>/package.json exists', () => {
    const tree = createTree('/repo', { seed: { 'apps/web-billing/package.json': '{}' } })
    expect(validateZoneDoesNotExist(tree, 'billing').ok).toBe(false)
  })
})

describe('validateModuleExists', () => {
  it('passes when module .module.ts is present', () => {
    const tree = createTree('/repo', {
      seed: { 'apps/api/src/modules/billing/billing.module.ts': 'x' },
    })
    expect(validateModuleExists(tree, 'billing').ok).toBe(true)
  })
  it('fails when module is absent', () => {
    expect(validateModuleExists(createTree('/repo'), 'billing').ok).toBe(false)
  })
})
