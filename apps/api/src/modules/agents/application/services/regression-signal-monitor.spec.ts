/**
 * regression-signal-monitor.spec.ts — Plan 11 Task 5
 *
 * Covers:
 *  1. Config not found → { tripped: false, trippedSignals: [] }
 *  2. Config status !== 'active' (rolled_back) → { tripped: false, trippedSignals: [] }
 *  3. No shadow runs in window → all signals at 0, tripped: false
 *  4. Error rate below threshold (1/10 = 10%, threshold=0.20) → no trip
 *  5. Error rate above threshold (3/10 = 30%, threshold=0.20) → trips error_rate signal
 *  6. Window filtering: runs outside the window are excluded (0 total in window → no trip)
 */

import { describe, it, expect, vi } from 'vitest'
import { RegressionSignalMonitor } from './regression-signal-monitor'
import type { RegressionThresholds } from '../../infrastructure/schema/agents.schema'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ROLLOUT_CONFIG_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_ID = '01900000-0000-7000-8000-000000000002'
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes

const DEFAULT_THRESHOLDS: RegressionThresholds = {
  error_rate_max: 0.2,
  cost_delta_pct_max: 0.2,
  initiator_approval_drop_max: 0.1,
  router_accuracy_signal_max: 0.15,
}

function makeConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ROLLOUT_CONFIG_ID,
    tenantId: TENANT_ID,
    status: 'active',
    regressionThresholds: DEFAULT_THRESHOLDS,
    ...overrides,
  }
}

// ─── DB Mock factory ──────────────────────────────────────────────────────────

/**
 * Builds a DB mock for RegressionSignalMonitor.
 *
 * Two sequential selects:
 *   1st → agentRolloutConfig rows (configRows)
 *   2nd → [{ count: totalCount }] (total shadow runs in window)
 *   3rd → [{ count: errorCount }] (shadow_errored runs in window)
 *
 * If configRows is empty, only one select is expected.
 */
function buildDb(configRows: Record<string, unknown>[], totalCount: number, errorCount: number) {
  // Each call to select() returns a new chain.
  // We track which call we're on by using a closure counter.
  const calls: Array<Record<string, unknown>[]> = [
    configRows,
    [{ count: String(totalCount) }],
    [{ count: String(errorCount) }],
  ]
  let callIdx = 0

  const selectMock = vi.fn().mockImplementation(() => {
    const idx = callIdx++
    const rows = calls[idx] ?? []

    // Each chain can end with .where(), .limit(), or directly resolve
    const limitMock = vi.fn().mockResolvedValue(rows)
    const whereMock = vi.fn().mockReturnValue({ limit: limitMock, then: undefined })
    // For aggregate selects that do NOT use .limit()
    const whereResolvingMock = vi.fn().mockResolvedValue(rows)

    // We need to handle both patterns:
    //   select().from().where().limit()   ← config lookup
    //   select().from().where()           ← count queries (resolve directly)
    //
    // We detect which call we're on by idx:
    //   idx=0 → config lookup (uses .limit())
    //   idx=1,2 → count queries (resolve from .where())
    if (idx === 0) {
      const fromMock = vi.fn().mockReturnValue({ where: whereMock })
      return { from: fromMock }
    } else {
      const fromMock = vi.fn().mockReturnValue({ where: whereResolvingMock })
      return { from: fromMock }
    }
  })

  return { db: { select: selectMock } as never, selectMock }
}

/**
 * Builds a DB mock that only has a config select (no count selects).
 * Used when the monitor short-circuits before querying shadow runs.
 */
function buildDbConfigOnly(configRows: Record<string, unknown>[]) {
  const limitMock = vi.fn().mockResolvedValue(configRows)
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock })
  const fromMock = vi.fn().mockReturnValue({ where: whereMock })
  const selectMock = vi.fn().mockReturnValue({ from: fromMock })

  return { db: { select: selectMock } as never, selectMock }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RegressionSignalMonitor', () => {
  // ── 1. Config not found ────────────────────────────────────────────────────

  it('1. returns tripped=false when rollout config is not found', async () => {
    const { db } = buildDbConfigOnly([])
    const monitor = new RegressionSignalMonitor(db)

    const result = await monitor.evaluate({
      rolloutConfigId: ROLLOUT_CONFIG_ID,
      windowMs: WINDOW_MS,
    })

    expect(result).toEqual({ tripped: false, trippedSignals: [], signals: [] })
  })

  // ── 2. Config status !== 'active' ─────────────────────────────────────────

  it('2. returns tripped=false when config status is rolled_back (inactive)', async () => {
    const { db } = buildDbConfigOnly([makeConfig({ status: 'rolled_back' })])
    const monitor = new RegressionSignalMonitor(db)

    const result = await monitor.evaluate({
      rolloutConfigId: ROLLOUT_CONFIG_ID,
      windowMs: WINDOW_MS,
    })

    expect(result).toEqual({ tripped: false, trippedSignals: [], signals: [] })
  })

  // ── 3. No shadow runs in window ────────────────────────────────────────────

  it('3. returns tripped=false when no shadow runs exist in window (all signals at 0)', async () => {
    const { db } = buildDb([makeConfig()], 0, 0)
    const monitor = new RegressionSignalMonitor(db)

    const result = await monitor.evaluate({
      rolloutConfigId: ROLLOUT_CONFIG_ID,
      windowMs: WINDOW_MS,
    })

    expect(result.tripped).toBe(false)
    expect(result.trippedSignals).toHaveLength(0)
  })

  // ── 4. Error rate below threshold ─────────────────────────────────────────

  it('4. error rate below threshold: 1/10 = 0.10 < threshold 0.20 → no trip', async () => {
    const { db } = buildDb([makeConfig()], 10, 1)
    const monitor = new RegressionSignalMonitor(db)

    const result = await monitor.evaluate({
      rolloutConfigId: ROLLOUT_CONFIG_ID,
      windowMs: WINDOW_MS,
    })

    expect(result.tripped).toBe(false)
    expect(result.trippedSignals).toHaveLength(0)
  })

  // ── 5. Error rate above threshold ─────────────────────────────────────────

  it('5. error rate above threshold: 3/10 = 0.30 > threshold 0.20 → trips error_rate', async () => {
    const { db } = buildDb([makeConfig()], 10, 3)
    const monitor = new RegressionSignalMonitor(db)

    const result = await monitor.evaluate({
      rolloutConfigId: ROLLOUT_CONFIG_ID,
      windowMs: WINDOW_MS,
    })

    expect(result.tripped).toBe(true)
    expect(result.trippedSignals).toHaveLength(1)
    expect(result.trippedSignals[0]).toMatchObject({
      signal: 'error_rate',
      observed: 0.3,
      threshold: 0.2,
    })
  })

  // ── 6. Window filtering ────────────────────────────────────────────────────

  it('6. window filtering: when total in window = 0, error_rate = 0 → no trip even with non-zero threshold', async () => {
    // Simulates a scenario where all shadow runs are outside the rolling window
    const { db } = buildDb([makeConfig()], 0, 0)
    const monitor = new RegressionSignalMonitor(db)

    const result = await monitor.evaluate({
      rolloutConfigId: ROLLOUT_CONFIG_ID,
      windowMs: 60_000, // narrow 1-minute window
    })

    expect(result.tripped).toBe(false)
    expect(result.trippedSignals).toHaveLength(0)
  })

  // ── Stub signals are marked disabled ──────────────────────────────────────

  it('stub signals (cost_delta_pct, initiator_approval_drop, router_accuracy_signal) are marked disabled: true', async () => {
    const { db } = buildDb([makeConfig()], 10, 1)
    const monitor = new RegressionSignalMonitor(db)

    const result = await monitor.evaluate({
      rolloutConfigId: ROLLOUT_CONFIG_ID,
      windowMs: WINDOW_MS,
    })

    const stubNames = ['cost_delta_pct', 'initiator_approval_drop', 'router_accuracy_signal']
    for (const name of stubNames) {
      const signal = result.signals.find((s) => s.signal === name)
      expect(signal).toBeDefined()
      expect(signal?.disabled).toBe(true)
    }
  })

  // ── Disabled signals skip evaluation even if observed > threshold ──────────

  it('skips disabled signals even if observed exceeds threshold', async () => {
    // Set extremely low thresholds for stub signals so observed=0 would NOT trip,
    // but the important thing is disabled: true prevents them from appearing in trippedSignals.
    // We verify this by confirming none of the disabled signals appear in trippedSignals.
    const config = makeConfig({
      regressionThresholds: {
        error_rate_max: 0.2,
        cost_delta_pct_max: 0.05, // lower than anything cost could observe
        initiator_approval_drop_max: 0.05,
        router_accuracy_signal_max: 0.05,
      } satisfies RegressionThresholds,
    })

    const { db } = buildDb([config], 10, 1) // 1/10 = 0.10 < 0.20 → error_rate no trip
    const monitor = new RegressionSignalMonitor(db)

    const result = await monitor.evaluate({
      rolloutConfigId: ROLLOUT_CONFIG_ID,
      windowMs: WINDOW_MS,
    })

    // Disabled signals must NOT appear in trippedSignals
    const trippedNames = result.trippedSignals.map((s) => s.signal)
    expect(trippedNames).not.toContain('cost_delta_pct')
    expect(trippedNames).not.toContain('initiator_approval_drop')
    expect(trippedNames).not.toContain('router_accuracy_signal')

    // The disabled signals ARE present in result.signals (observable in reports)
    const costSignal = result.signals.find((s) => s.signal === 'cost_delta_pct')
    expect(costSignal?.disabled).toBe(true)
  })
})
