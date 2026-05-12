import { describe, expect, it } from 'vitest'

describe('@seta/agent-core barrel', () => {
  it('package imports cleanly', async () => {
    const mod = await import('./index')
    expect(mod).toBeTypeOf('object')
  })
})
