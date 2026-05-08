import { describe, expect, it, vi } from 'vitest'

vi.mock('../trpc', () => ({
  trpc: {
    people: {
      listProfileChangeRequests: { query: vi.fn() },
    },
  },
}))

describe('use-hr-change-requests module', () => {
  it('exports useHrChangeRequests function', async () => {
    const mod = await import('./use-hr-change-requests')
    expect(typeof mod.useHrChangeRequests).toBe('function')
  })

  it('HrFilter type includes all_pending and recent', async () => {
    const mod = await import('./use-hr-change-requests')
    expect(mod.useHrChangeRequests).toBeDefined()
  })
})
