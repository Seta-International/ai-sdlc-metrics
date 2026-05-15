import { beforeEach, describe, expect, it } from 'vitest'
import { localBool } from './storage'

beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

describe('localBool', () => {
  it('reads false when unset', () => {
    expect(localBool('seta:sidebar:collapsed').get()).toBe(false)
  })
  it('reads true when set to "1"', () => {
    localStorage.setItem('seta:sidebar:collapsed', '1')
    expect(localBool('seta:sidebar:collapsed').get()).toBe(true)
  })
  it('writes "1" / removes for false', () => {
    const k = localBool('seta:agent-panel:open')
    k.set(true)
    expect(localStorage.getItem('seta:agent-panel:open')).toBe('1')
    k.set(false)
    expect(localStorage.getItem('seta:agent-panel:open')).toBeNull()
  })
  it('survives missing window (SSR)', () => {
    const saved = globalThis.localStorage
    // @ts-expect-error force absence
    delete globalThis.localStorage
    expect(localBool('seta:sidebar:collapsed').get()).toBe(false)
    globalThis.localStorage = saved
  })
})
