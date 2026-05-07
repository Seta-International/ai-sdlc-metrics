import { describe, it, expect } from 'vitest'
import { kebab, camel, pascal, screamingSnake, isValidKebab } from './naming'

describe('naming', () => {
  it.each([
    ['billing', 'billing'],
    ['Billing', 'billing'],
    ['billingItem', 'billing-item'],
    ['BillingItem', 'billing-item'],
    ['billing_item', 'billing-item'],
  ])('kebab(%s) === %s', (a, b) => expect(kebab(a)).toBe(b))

  it.each([
    ['billing', 'billing'],
    ['billing-item', 'billingItem'],
    ['Billing Item', 'billingItem'],
  ])('camel(%s) === %s', (a, b) => expect(camel(a)).toBe(b))

  it.each([
    ['billing', 'Billing'],
    ['billing-item', 'BillingItem'],
    ['BILLING_ITEM', 'BillingItem'],
  ])('pascal(%s) === %s', (a, b) => expect(pascal(a)).toBe(b))

  it.each([
    ['billing', 'BILLING'],
    ['billing-item', 'BILLING_ITEM'],
    ['billingItem', 'BILLING_ITEM'],
  ])('screamingSnake(%s) === %s', (a, b) => expect(screamingSnake(a)).toBe(b))

  it.each([
    ['billing', true],
    ['billing-item', true],
    ['Billing', false],
    ['-billing', false],
    ['billing-', false],
    ['billing_item', false],
    ['', false],
    ['a', false],
  ])('isValidKebab(%s) === %s', (a, b) => expect(isValidKebab(a)).toBe(b))
})
