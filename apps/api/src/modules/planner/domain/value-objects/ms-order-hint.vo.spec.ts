import { describe, expect, it } from 'vitest'
import { MsOrderHint } from './ms-order-hint.vo'

describe('MsOrderHint', () => {
  describe('between(undefined, undefined)', () => {
    it('returns the MS baseline hint " !"', () => {
      expect(MsOrderHint.between(undefined, undefined)).toBe(' !')
    })
  })

  describe('between(a, undefined)', () => {
    it('returns a hint that sorts AFTER a lexicographically', () => {
      const a = ' !'
      const result = MsOrderHint.between(a, undefined)
      expect(result > a).toBe(true)
    })

    it('appends " !" to a', () => {
      const a = ' !'
      expect(MsOrderHint.between(a, undefined)).toBe(' ! !')
    })
  })

  describe('between(undefined, b)', () => {
    it('returns a hint that sorts BEFORE b lexicographically', () => {
      const b = ' !'
      const result = MsOrderHint.between(undefined, b)
      expect(result < b).toBe(true)
    })

    it('returns " " when b starts with "!" (first char is 33)', () => {
      const b = '!'
      const result = MsOrderHint.between(undefined, b)
      expect(result).toBe(' ')
    })
  })

  describe('between(a, b)', () => {
    it('returns a hint with a < hint < b lexicographically', () => {
      const a = ' !'
      const b = ' ! !'
      const result = MsOrderHint.between(a, b)
      expect(result > a).toBe(true)
      expect(result < b).toBe(true)
    })

    it('handles strings that differ at position 0', () => {
      const a = 'a'
      const b = 'c'
      const result = MsOrderHint.between(a, b)
      expect(result > a).toBe(true)
      expect(result < b).toBe(true)
    })

    it('handles strings with common prefix', () => {
      const a = 'aa'
      const b = 'ac'
      const result = MsOrderHint.between(a, b)
      expect(result > a).toBe(true)
      expect(result < b).toBe(true)
    })
  })

  describe('length ceiling', () => {
    it('a single hint returned by between is ≤ 50 chars', () => {
      const hint = MsOrderHint.between(undefined, undefined)
      expect(hint.length).toBeLessThanOrEqual(50)
    })

    it('interleaving 1000 between calls keeps length ≤ 50 chars', () => {
      // Build a list by always inserting between first and second item
      let items = [MsOrderHint.between(undefined, undefined)]
      // Insert a second item after the first
      items.push(MsOrderHint.between(items[0], undefined))

      for (let i = 0; i < 998; i++) {
        // Interleave: insert between items[0] and items[1]
        const newHint = MsOrderHint.between(items[0], items[1])
        // Splice in between
        items = [items[0], newHint, ...items.slice(1)]
        // Keep list size manageable — only track the first 3
        if (items.length > 3) items = [items[0], items[1], items[2]]
      }

      const maxLen = Math.max(...items.map((h) => h.length))
      expect(maxLen).toBeLessThanOrEqual(50)
    })
  })

  describe('golden fixtures', () => {
    it('between(undefined, undefined) === " !"', () => {
      expect(MsOrderHint.between(undefined, undefined)).toBe(' !')
    })

    it('between(" !", undefined) === " ! !"', () => {
      expect(MsOrderHint.between(' !', undefined)).toBe(' ! !')
    })

    it('between(undefined, " !") === " "', () => {
      expect(MsOrderHint.between(undefined, ' !')).toBe(' ')
    })

    it('between(" !", " ! !") is between " !" and " ! !" lexicographically', () => {
      const s = MsOrderHint.between(' !', ' ! !')
      expect(s > ' !').toBe(true)
      expect(s < ' ! !').toBe(true)
    })
  })

  describe('TypeError on malformed input', () => {
    it('throws TypeError when first argument is a number', () => {
      expect(() => MsOrderHint.between(42 as unknown as string, undefined)).toThrow(TypeError)
    })

    it('throws TypeError when second argument is a number', () => {
      expect(() => MsOrderHint.between(undefined, 42 as unknown as string)).toThrow(TypeError)
    })

    it('throws TypeError when first argument is null', () => {
      expect(() => MsOrderHint.between(null as unknown as string, undefined)).toThrow(TypeError)
    })

    it('throws TypeError when second argument is null', () => {
      expect(() => MsOrderHint.between(undefined, null as unknown as string)).toThrow(TypeError)
    })

    it('throws TypeError when first argument is empty string', () => {
      expect(() => MsOrderHint.between('', undefined)).toThrow(TypeError)
    })

    it('throws TypeError when second argument is empty string', () => {
      expect(() => MsOrderHint.between(undefined, '')).toThrow(TypeError)
    })

    it('throws TypeError when first argument is an object', () => {
      expect(() => MsOrderHint.between({} as unknown as string, undefined)).toThrow(TypeError)
    })

    it('does NOT throw when both args are undefined', () => {
      expect(() => MsOrderHint.between(undefined, undefined)).not.toThrow()
    })

    it('does NOT throw when args are valid strings', () => {
      expect(() => MsOrderHint.between(' !', ' ! !')).not.toThrow()
    })
  })

  describe('monotonic invariant — repeated insertions in same gap', () => {
    it('repeated insertions in same gap stay strictly monotonic', () => {
      const h1 = MsOrderHint.between(undefined, undefined)
      const h2 = MsOrderHint.between(h1, undefined)
      const h3 = MsOrderHint.between(h1, h2)
      const h4 = MsOrderHint.between(h3, h2)
      expect(h4 > h3).toBe(true)
      expect(h4 < h2).toBe(true)
    })
  })
})
