import { describe, expect, it } from 'vitest'
import { orderHintBetween } from './order-hint'

describe('orderHintBetween (client-side mirror of MsOrderHint)', () => {
  describe('golden fixtures', () => {
    it('between(undefined, undefined) === " !"', () => {
      expect(orderHintBetween(undefined, undefined)).toBe(' !')
    })

    it('between(" !", undefined) === " ! !"', () => {
      expect(orderHintBetween(' !', undefined)).toBe(' ! !')
    })

    it('between(undefined, " !") === " "', () => {
      expect(orderHintBetween(undefined, ' !')).toBe(' ')
    })

    it('between(" !", " ! !") is between " !" and " ! !" lexicographically', () => {
      const s = orderHintBetween(' !', ' ! !')
      expect(s > ' !').toBe(true)
      expect(s < ' ! !').toBe(true)
    })
  })

  describe('ordering invariants', () => {
    it('between(a, undefined) sorts after a', () => {
      const a = ' !'
      expect(orderHintBetween(a, undefined) > a).toBe(true)
    })

    it('between(undefined, b) sorts before b', () => {
      const b = ' !'
      expect(orderHintBetween(undefined, b) < b).toBe(true)
    })

    it('between(a, b) sorts strictly between a and b', () => {
      const a = ' !'
      const b = ' ! !'
      const c = orderHintBetween(a, b)
      expect(c > a).toBe(true)
      expect(c < b).toBe(true)
    })
  })

  describe('TypeError on malformed input', () => {
    it('throws TypeError when first argument is a number', () => {
      expect(() => orderHintBetween(42 as unknown as string, undefined)).toThrow(TypeError)
    })

    it('throws TypeError when second argument is a number', () => {
      expect(() => orderHintBetween(undefined, 42 as unknown as string)).toThrow(TypeError)
    })

    it('throws TypeError when first argument is null', () => {
      expect(() => orderHintBetween(null as unknown as string, undefined)).toThrow(TypeError)
    })

    it('throws TypeError when second argument is null', () => {
      expect(() => orderHintBetween(undefined, null as unknown as string)).toThrow(TypeError)
    })

    it('throws TypeError when first argument is empty string', () => {
      expect(() => orderHintBetween('', undefined)).toThrow(TypeError)
    })

    it('throws TypeError when second argument is empty string', () => {
      expect(() => orderHintBetween(undefined, '')).toThrow(TypeError)
    })
  })

  describe('monotonic invariant — repeated insertions in same gap', () => {
    it('repeated insertions in same gap stay strictly monotonic', () => {
      const h1 = orderHintBetween(undefined, undefined)
      const h2 = orderHintBetween(h1, undefined)
      const h3 = orderHintBetween(h1, h2)
      const h4 = orderHintBetween(h3, h2)
      expect(h4 > h3).toBe(true)
      expect(h4 < h2).toBe(true)
    })
  })
})
