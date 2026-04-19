import { describe, expect, it } from 'vitest'
import { chartTokens } from './chart'

describe('chartTokens', () => {
  it('defines a palette for each chart dimension used by the planner', () => {
    expect(Object.keys(chartTokens.progress)).toEqual(['not-started', 'in-progress', 'completed'])
    expect(Object.keys(chartTokens.priority)).toEqual(['urgent', 'important', 'medium', 'low'])
    expect(chartTokens.assigneeTints.length).toBeGreaterThanOrEqual(12)
    expect(chartTokens.bucket).toHaveLength(6)
  })

  it('every color is a valid DESIGN.md-compliant CSS variable reference', () => {
    for (const map of [chartTokens.progress, chartTokens.priority] as const) {
      for (const v of Object.values(map)) expect(v).toMatch(/^(var\(--|#)/)
    }
    for (const v of [...chartTokens.bucket, ...chartTokens.assigneeTints]) {
      expect(v).toMatch(/^(var\(--|#)/)
    }
  })

  it('token values are stable (snapshot)', () => {
    expect(chartTokens).toMatchSnapshot()
  })
})
