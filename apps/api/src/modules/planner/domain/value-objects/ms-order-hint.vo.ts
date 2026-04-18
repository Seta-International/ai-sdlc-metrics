/**
 * MsOrderHint — pure lexicographic ordering hint following the Microsoft Planner
 * order-hint algorithm. No external dependencies.
 *
 * Rules:
 *  - between(undefined, undefined) → ' !' (baseline)
 *  - between(a, undefined)         → a + ' !'
 *  - between(undefined, b)         → String.fromCharCode(b.charCodeAt(0) - 1)
 *                                     (falls back to ' ' if first char ≤ 33)
 *  - between(a, b)                 → midpoint at first differing position;
 *                                     if chars are adjacent, extend with ' !'
 */
export class MsOrderHint {
  private constructor() {}

  static between(a?: string, b?: string): string {
    if (a !== undefined && typeof a !== 'string') {
      throw new TypeError(`MsOrderHint.between: a must be a string or undefined, got ${typeof a}`)
    }
    if (b !== undefined && typeof b !== 'string') {
      throw new TypeError(`MsOrderHint.between: b must be a string or undefined, got ${typeof b}`)
    }
    if (a === '' || b === '') throw new TypeError('order hint cannot be empty string')

    if (!a && !b) return ' !'

    if (!b) {
      // between(a, undefined): insert after a
      return a! + ' !'
    }

    if (!a) {
      // between(undefined, b): insert before b
      const first = b.charCodeAt(0)
      if (first <= 33) return ' ' // fallback: can't go lower than space
      return String.fromCharCode(first - 1)
    }

    // Both defined: scan until the first position where the virtual padded strings differ.
    // Positions beyond a string's length are treated as space (ASCII 32).
    const maxLen = Math.max(a.length, b.length) + 2
    for (let i = 0; i < maxLen; i++) {
      const ca = i < a.length ? a.charCodeAt(i) : 32
      const cb = i < b.length ? b.charCodeAt(i) : 32
      if (ca === cb) continue

      if (cb - ca > 1) {
        // A midpoint character exists between ca and cb
        return a.slice(0, i) + String.fromCharCode(Math.floor((ca + cb) / 2))
      }

      // Characters are adjacent (cb - ca === 1).
      // Extend a (never truncate) with virtual spaces up to position i, then append a
      // trailing space to create a value that slots strictly between a and b.
      if (i < a.length) return a + ' '
      const padding = ' '.repeat(i - a.length + 1)
      return a + padding + ' '
    }

    // Fallback (should not be reached for valid a < b)
    return a + ' !'
  }
}
