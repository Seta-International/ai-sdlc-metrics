import { describe, expect, it } from 'vitest'
import { resolveNextUrl } from './resolve-next-url'

describe('resolveNextUrl', () => {
  it('returns returnTo when it is a safe local path', () => {
    expect(resolveNextUrl({ returnTo: '/studio/runs' })).toBe('/studio/runs')
  })
  it('rejects protocol-relative returnTo (open redirect)', () => {
    expect(resolveNextUrl({ returnTo: '//evil.com/x' })).toBe('/console/')
  })
  it('rejects absolute http returnTo', () => {
    expect(resolveNextUrl({ returnTo: 'http://evil.com' })).toBe('/console/')
  })
  it('falls back to lastApp when no returnTo', () => {
    expect(resolveNextUrl({ lastApp: 'studio' })).toBe('/studio/')
  })
  it('ignores unknown lastApp', () => {
    expect(resolveNextUrl({ lastApp: 'evil' })).toBe('/console/')
  })
  it('defaults to /console/ when neither is set', () => {
    expect(resolveNextUrl({})).toBe('/console/')
  })
})
