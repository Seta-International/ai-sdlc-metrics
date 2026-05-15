import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetQueueRegistryForTests,
  enqueueRun,
  getQueueSize,
  setPerTenantConcurrency,
} from './queue'

describe('queue', () => {
  beforeEach(() => {
    __resetQueueRegistryForTests()
  })

  it('runs enqueued fn', async () => {
    let ran = false
    await enqueueRun('t1', async () => {
      ran = true
    })
    expect(ran).toBe(true)
  })

  it('setPerTenantConcurrency rejects invalid values', () => {
    expect(() => setPerTenantConcurrency(0)).toThrow()
    expect(() => setPerTenantConcurrency(-1)).toThrow()
    expect(() => setPerTenantConcurrency(1.5)).toThrow()
  })

  it('serialises per-tenant fns at the configured concurrency', async () => {
    setPerTenantConcurrency(2)
    let active = 0
    let maxActive = 0
    const work = async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 10))
      active--
    }
    await Promise.all([enqueueRun('t1', work), enqueueRun('t1', work), enqueueRun('t1', work)])
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('isolates queues per tenant', async () => {
    setPerTenantConcurrency(1)
    let aRan = 0
    let bRan = 0
    await Promise.all([
      enqueueRun('a', async () => {
        aRan++
      }),
      enqueueRun('b', async () => {
        bRan++
      }),
    ])
    expect(aRan).toBe(1)
    expect(bRan).toBe(1)
    expect(getQueueSize('a')).toBe(0)
    expect(getQueueSize('b')).toBe(0)
  })
})
