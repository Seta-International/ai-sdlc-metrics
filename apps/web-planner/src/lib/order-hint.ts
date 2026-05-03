/**
 * orderHintBetween — client-side mirror of the server-side MsOrderHint algorithm.
 *
 * Computes a lexicographic order hint `c` such that `a < c < b`.
 * Same algorithm as apps/api MsOrderHint.between — keep in sync.
 *
 * Rules:
 *  - between(undefined, undefined) → ' !' (baseline)
 *  - between(a, undefined)         → a + ' !'
 *  - between(undefined, b)         → String.fromCharCode(b.charCodeAt(0) - 1)
 *                                     (falls back to ' !' if first char ≤ 34 — result '!' at index 0 is rejected by MS)
 *  - between(a, b)                 → midpoint at first differing position;
 *                                     if chars are adjacent, extend with a trailing space
 */
export function orderHintBetween(a?: string, b?: string): string {
  if (a !== undefined && typeof a !== 'string') {
    throw new TypeError(`orderHintBetween: a must be a string or undefined, got ${typeof a}`)
  }
  if (b !== undefined && typeof b !== 'string') {
    throw new TypeError(`orderHintBetween: b must be a string or undefined, got ${typeof b}`)
  }
  if (a === '' || b === '') throw new TypeError('order hint cannot be empty string')

  if (!a && !b) return ' !'

  if (!b) {
    // Insert after a
    return a! + ' !'
  }

  if (!a) {
    // Insert before b
    const first = b.charCodeAt(0)
    if (first <= 34) return ' !'
    return String.fromCharCode(first - 1)
  }

  // Both defined: find first position where the virtual padded strings differ.
  // Positions beyond a string's length are treated as space (ASCII 32).
  const maxLen = Math.max(a.length, b.length) + 2
  for (let i = 0; i < maxLen; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 32
    const cb = i < b.length ? b.charCodeAt(i) : 32
    if (ca === cb) continue

    if (cb - ca > 1) {
      // Midpoint character exists.
      // Skip ASCII 91-96 ([, \, ], ^, _, `) — these sort differently across collations.
      let mid = Math.floor((ca + cb) / 2)
      if (mid >= 91 && mid <= 96) {
        mid = ca < 90 ? 90 : 97
      }
      if (mid !== ca && mid !== cb) {
        return a.slice(0, i) + String.fromCharCode(mid)
      }
      // No safe midpoint — fall through to extension logic below.
    }

    // Adjacent chars (or mid collapsed to endpoint): extend a (never truncate) with virtual
    // spaces up to position i, then append a trailing space to slot strictly between a and b.
    if (i < a.length) return a + ' '
    const padding = ' '.repeat(i - a.length + 1)
    return a + padding + ' '
  }

  // Fallback (should not be reached for valid a < b)
  return a + ' !'
}
