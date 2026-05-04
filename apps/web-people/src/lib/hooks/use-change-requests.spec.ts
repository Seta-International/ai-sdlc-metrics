import { describe, it, expect } from 'vitest'

describe('use-change-requests module', () => {
  it('exports useChangeRequests function', async () => {
    const mod = await import('./use-change-requests')
    expect(typeof mod.useChangeRequests).toBe('function')
  })

  it('exports usePendingFieldPaths function', async () => {
    const mod = await import('./use-change-requests')
    expect(typeof mod.usePendingFieldPaths).toBe('function')
  })
})
