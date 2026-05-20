import { describe, expect, it } from 'vitest'
import { escapeCell, toCsvRow } from '../csv.js'

describe('escapeCell', () => {
  it('returns plain text unchanged', () => {
    expect(escapeCell('hello')).toBe('hello')
  })

  it('wraps a value containing a comma in quotes', () => {
    expect(escapeCell('a,b')).toBe('"a,b"')
  })

  it('wraps a value containing a quote and doubles the inner quote', () => {
    expect(escapeCell('he said "hi"')).toBe('"he said ""hi"""')
  })

  it('wraps a value containing a newline', () => {
    expect(escapeCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('handles Vietnamese diacritics without escaping', () => {
    expect(escapeCell('Nguyễn Văn Nam')).toBe('Nguyễn Văn Nam')
  })

  it('serializes JSON content correctly when it contains commas', () => {
    const json = JSON.stringify([{ text: 'a', done: false }])
    expect(escapeCell(json)).toBe('"[{""text"":""a"",""done"":false}]"')
  })

  it('returns an empty string for empty input', () => {
    expect(escapeCell('')).toBe('')
  })
})

describe('toCsvRow', () => {
  it('joins escaped cells with commas', () => {
    expect(toCsvRow(['a', 'b', 'c'])).toBe('a,b,c')
  })

  it('quotes only the cells that need it', () => {
    expect(toCsvRow(['plain', 'a,b', 'plain'])).toBe('plain,"a,b",plain')
  })
})
