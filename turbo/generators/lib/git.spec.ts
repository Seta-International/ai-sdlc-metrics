import { describe, it, expect } from 'vitest'
import { parsePorcelain, anyDirty } from './git'

describe('parsePorcelain', () => {
  it('parses a multi-line porcelain output', () => {
    const out = ' M apps/api/src/foo.ts\n?? apps/web-billing/\n A  packages/db/x.ts\n'
    expect(parsePorcelain(out)).toEqual([
      'apps/api/src/foo.ts',
      'apps/web-billing/',
      'packages/db/x.ts',
    ])
  })

  it('handles empty input', () => {
    expect(parsePorcelain('')).toEqual([])
  })
})

describe('anyDirty', () => {
  it('returns true when any tracked path matches a porcelain entry', () => {
    expect(anyDirty(['apps/api/src/foo.ts'], ['apps/api/'])).toBe(true)
  })
  it('returns false when no overlap', () => {
    expect(anyDirty(['packages/db/x.ts'], ['apps/api/'])).toBe(false)
  })
})
