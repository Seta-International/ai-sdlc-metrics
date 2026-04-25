import { describe, it, expect } from 'vitest'
import { QuarterlyRedTeamDrill } from './quarterly-red-team-drill'
import type { PlantedDegradationSpec } from './quarterly-red-team-drill'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const PLANTED: PlantedDegradationSpec = {
  kind: 'broken_prompt',
  duration: { minutes: 30 },
}

const PLANTED_AT = new Date('2026-05-15T09:40:00Z')

const BASE_OPTS = {
  quarter: '2026-Q2',
  tenantId: 'tenant-1',
  plantedDegradation: PLANTED,
  plantedAt: PLANTED_AT,
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('QuarterlyRedTeamDrill', () => {
  const drill = new QuarterlyRedTeamDrill()

  // ── outcome ─────────────────────────────────────────────────────────────────

  it('detectedAt set + rolledBack=true → outcome=passed', async () => {
    const result = await drill.execute({
      ...BASE_OPTS,
      detectedAt: new Date(),
      rolledBack: true,
    })

    expect(result.outcome).toBe('passed')
  })

  it('no detectedAt → outcome=failed', async () => {
    const result = await drill.execute({
      ...BASE_OPTS,
      rolledBack: false,
    })

    expect(result.outcome).toBe('failed')
  })

  it('detectedAt set + rolledBack=false → outcome=failed', async () => {
    const result = await drill.execute({
      ...BASE_OPTS,
      detectedAt: new Date(),
      rolledBack: false,
    })

    expect(result.outcome).toBe('failed')
  })

  it('no detectedAt + rolledBack=true → outcome=failed (not both conditions met)', async () => {
    const result = await drill.execute({
      ...BASE_OPTS,
      rolledBack: true,
    })

    expect(result.outcome).toBe('failed')
  })

  // ── detectionLatencyMinutes ──────────────────────────────────────────────────

  it('detectionLatencyMinutes is calculated from plantedAt to detectedAt', async () => {
    // plantedAt = T, detectedAt = T + 18 minutes → latency should be 18
    const plantedAt = new Date('2026-05-15T09:00:00Z')
    const detectedAt = new Date(plantedAt.getTime() + 18 * 60 * 1000)

    const result = await drill.execute({
      ...BASE_OPTS,
      plantedAt,
      detectedAt,
      rolledBack: true,
    })

    expect(result.detectionLatencyMinutes).toBe(18)
  })

  it('detectionLatencyMinutes is undefined when no detectedAt is provided', async () => {
    const result = await drill.execute({
      ...BASE_OPTS,
      rolledBack: false,
    })

    expect(result.detectionLatencyMinutes).toBeUndefined()
  })

  // ── quarter ──────────────────────────────────────────────────────────────────

  it('returns the quarter string in the result', async () => {
    const result = await drill.execute({
      ...BASE_OPTS,
      quarter: '2026-Q3',
      rolledBack: false,
    })

    expect(result.quarter).toBe('2026-Q3')
  })

  // ── rolledBack ───────────────────────────────────────────────────────────────

  it('reflects rolledBack=true in the result', async () => {
    const result = await drill.execute({
      ...BASE_OPTS,
      detectedAt: new Date(),
      rolledBack: true,
    })

    expect(result.rolledBack).toBe(true)
  })

  it('reflects rolledBack=false in the result', async () => {
    const result = await drill.execute({
      ...BASE_OPTS,
      rolledBack: false,
    })

    expect(result.rolledBack).toBe(false)
  })

  // ── detectedAt passthrough ──────────────────────────────────────────────────

  it('returns detectedAt in the result when provided', async () => {
    const detectedAt = new Date('2026-05-15T10:00:00Z')

    const result = await drill.execute({
      ...BASE_OPTS,
      detectedAt,
      rolledBack: true,
    })

    expect(result.detectedAt).toBe(detectedAt)
  })

  it('detectedAt is undefined in the result when not provided', async () => {
    const result = await drill.execute({
      ...BASE_OPTS,
      rolledBack: false,
    })

    expect(result.detectedAt).toBeUndefined()
  })

  // ── different degradation kinds ──────────────────────────────────────────────

  it.each(['broken_prompt', 'poisoned_tool_output', 'regressed_sub_agent'] as const)(
    'handles degradation kind %s',
    async (kind) => {
      const result = await drill.execute({
        ...BASE_OPTS,
        plantedDegradation: { kind, duration: { minutes: 15 } },
        detectedAt: new Date(),
        rolledBack: true,
      })

      expect(result.outcome).toBe('passed')
    },
  )
})
