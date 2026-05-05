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
    it('returns " !" (MS minimum) when b is already at the MS minimum hint', () => {
      // ' !' is the lowest valid MS orderHint; no valid MS hint sorts strictly before it,
      // so we return the minimum itself and let MS resolve ordering on next pull.
      const b = ' !'
      const result = MsOrderHint.between(undefined, b)
      expect(result).toBe(' !')
    })

    it('returns " !" when b starts with "!" (first char ASCII 33, still at MS minimum range)', () => {
      const b = '!'
      const result = MsOrderHint.between(undefined, b)
      expect(result).toBe(' !')
    })

    it('returns " !" when b starts with \'"\' (first char ASCII 34, result would be ! at index 0)', () => {
      // '!' at index 0 is rejected by MS Graph; return the minimum ' !' instead
      const b = '"abc' // starts with '"' (ASCII 34)
      const result = MsOrderHint.between(undefined, b)
      expect(result).toBe(' !')
      expect(result < b).toBe(true) // ' !' (32, 33) < '"abc' (34, ...) ✓
    })

    it('returns a single char below b when b starts above ASCII 34', () => {
      const b = '#abc' // starts with '#' (ASCII 35)
      const result = MsOrderHint.between(undefined, b)
      expect(result).toBe('"') // String.fromCharCode(34)
      expect(result < b).toBe(true)
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

    it('between(undefined, " !") === " !" (MS minimum — cannot go lower without invalid whitespace)', () => {
      expect(MsOrderHint.between(undefined, ' !')).toBe(' !')
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

  describe('ASCII 91-96 zone avoidance', () => {
    it('result never contains chars in ASCII 91-96 range', () => {
      const problematic = /[\x5b-\x60]/
      const cases: Array<[string | undefined, string | undefined]> = [
        ['Z', 'b'], // gap straddles zone (90..98), midpoint 94 is in zone
        ['Y', 'a'], // gap includes the whole zone (89..97), midpoint 93 is in zone
        [' !', 'a!'], // realistic orderHints with zone in range
      ]
      for (const [a, b] of cases) {
        const result = MsOrderHint.between(a, b)
        expect(problematic.test(result)).toBe(false)
        if (a) expect(result > a).toBe(true)
        if (b) expect(result < b).toBe(true)
      }
    })

    it('midpoint between "Z" (90) and "b" (98) skips zone → uses "a" (97)', () => {
      // mid of (90 + 98) / 2 = 94 (\^), which is in zone; should use 90 ('Z') or fall through to 'a'
      const result = MsOrderHint.between('Z', 'b')
      expect(result > 'Z').toBe(true)
      expect(result < 'b').toBe(true)
      expect(/[\x5b-\x60]/.test(result)).toBe(false)
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

    it('frozen-fixture regression: between(" !   ", " ! !") is strictly between both', () => {
      // Exact values that triggered the truncation bug: ' !   ' (space excl 3×space)
      // and ' ! !' — inserting in this gap previously returned ' !   ' again
      const a = ' !   '
      const b = ' ! !'
      const result = MsOrderHint.between(a, b)
      expect(result).not.toBe(a)
      expect(result > a).toBe(true)
      expect(result < b).toBe(true)
    })
  })
})
