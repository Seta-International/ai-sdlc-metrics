import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DelegationExpirySweeper } from './delegation-expiry-sweep'
import type { DelegationLifecycle } from '../../application/services/delegation-lifecycle'

// ── Mocks ─────────────────────────────────────────────────────────────────────

function makeDelegationLifecycle(
  overrides: Partial<DelegationLifecycle> = {},
): DelegationLifecycle {
  return {
    sweepExpired: vi.fn().mockResolvedValue({ expiredCount: 0 }),
    create: vi.fn(),
    revoke: vi.fn(),
    listActive: vi.fn(),
    handleUserOffboarding: vi.fn(),
    ...overrides,
  } as unknown as DelegationLifecycle
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DelegationExpirySweeper', () => {
  let delegationLifecycle: DelegationLifecycle
  let sweeper: DelegationExpirySweeper

  beforeEach(() => {
    vi.clearAllMocks()
    delegationLifecycle = makeDelegationLifecycle()
    sweeper = new DelegationExpirySweeper(delegationLifecycle)
  })

  describe('handle()', () => {
    it('calls delegationLifecycle.sweepExpired()', async () => {
      await sweeper.handle()

      expect(delegationLifecycle.sweepExpired).toHaveBeenCalledOnce()
    })

    it('logs the expired count when delegations are found', async () => {
      const logSpy = vi.spyOn(sweeper['logger'], 'log').mockImplementation(() => undefined)
      delegationLifecycle = makeDelegationLifecycle({
        sweepExpired: vi.fn().mockResolvedValue({ expiredCount: 3 }),
      })
      sweeper = new DelegationExpirySweeper(delegationLifecycle)
      vi.spyOn(sweeper['logger'], 'log').mockImplementation(() => undefined)

      await sweeper.handle()

      expect(sweeper['logger'].log).toHaveBeenCalledWith(expect.stringContaining('3'))
      logSpy.mockRestore()
    })

    it('logs zero when no delegations are expired', async () => {
      const logSpy = vi.spyOn(sweeper['logger'], 'log').mockImplementation(() => undefined)

      await sweeper.handle()

      expect(sweeper['logger'].log).toHaveBeenCalledWith(expect.stringContaining('0'))
      logSpy.mockRestore()
    })
  })
})
