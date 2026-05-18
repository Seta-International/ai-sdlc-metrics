import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

// This block mirrors the inline sha256hex used inside `ingest.ts`.
// If you change the algorithm in `ingest.ts`, this test must change too.
function sha256hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

describe('ingest — sha256hex (inline)', () => {
  it('produces 64-char lowercase hex digest', () => {
    const h = sha256hex('hello world')
    expect(h).toHaveLength(64)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('matches the canonical reference vector', () => {
    // sha256("hello world") in lowercase hex
    expect(sha256hex('hello world')).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    )
  })

  it('UTF-8 byte interpretation (non-ASCII)', () => {
    // sha256(UTF-8 bytes of "héllo")
    expect(sha256hex('héllo')).toBe(
      '3c48591d8d098a4538f5e013dfcf406e948eac4d3277b10bf614e295d6068179',
    )
  })

  it('deterministic — same input twice → same digest', () => {
    expect(sha256hex('x')).toBe(sha256hex('x'))
  })

  it('different inputs → different digests', () => {
    expect(sha256hex('a')).not.toBe(sha256hex('b'))
  })
})
