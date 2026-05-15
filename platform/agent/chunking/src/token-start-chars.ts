import type { Tiktoken } from 'js-tiktoken'

/**
 * Maps each token index to its UTF-16 code-unit start offset in `input`,
 * plus a final entry equal to `input.length`. Length is always `tokens.length + 1`.
 *
 * Algorithm: for prefix length `i`, `encoder.decode(tokens.slice(0, i)).length`
 * is the start offset of token `i`. The final entry is snapped to `input.length`
 * to absorb U+FFFD replacement chars tiktoken inserts at multi-byte UTF-8 boundaries.
 */
export function tokenStartChars(tokens: number[], encoder: Tiktoken, input: string): number[] {
  const offsets = new Array<number>(tokens.length + 1)
  offsets[0] = 0

  for (let i = 1; i < tokens.length; i++) {
    offsets[i] = encoder.decode(tokens.slice(0, i)).length
  }

  offsets[tokens.length] = input.length
  return offsets
}
