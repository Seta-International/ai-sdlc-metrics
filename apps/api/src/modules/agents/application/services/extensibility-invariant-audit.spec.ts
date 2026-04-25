/**
 * extensibility-invariant-audit.spec.ts — Plan 13 Task 7
 *
 * Unit tests for ExtensibilityInvariantAudit.
 */

import { describe, it, expect } from 'vitest'
import { ExtensibilityInvariantAudit } from './extensibility-invariant-audit'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ExtensibilityInvariantAudit', () => {
  const audit = new ExtensibilityInvariantAudit()

  describe('run() on synthetic fixture (no violations)', () => {
    it('returns exactly 10 invariant results', async () => {
      const result = await audit.run()
      expect(result.perInvariant).toHaveLength(10)
    })

    it('all 10 invariants pass on the synthetic fixture', async () => {
      const result = await audit.run()
      for (const inv of result.perInvariant) {
        expect(inv.passed, `${inv.invariantId} should pass`).toBe(true)
      }
    })

    it('allPassed=true', async () => {
      const result = await audit.run()
      expect(result.allPassed).toBe(true)
    })

    it('all evidence strings are non-empty', async () => {
      const result = await audit.run()
      for (const inv of result.perInvariant) {
        expect(
          inv.evidence.length,
          `${inv.invariantId} evidence must be non-empty`,
        ).toBeGreaterThan(0)
      }
    })

    it('ranAt is a Date', async () => {
      const result = await audit.run()
      expect(result.ranAt).toBeInstanceOf(Date)
    })

    it('invariant IDs cover EI-1 through EI-10', async () => {
      const result = await audit.run()
      const ids = result.perInvariant.map((r) => r.invariantId)
      const expected = [
        'EI-1',
        'EI-2',
        'EI-3',
        'EI-4',
        'EI-5',
        'EI-6',
        'EI-7',
        'EI-8',
        'EI-9',
        'EI-10',
      ]
      for (const id of expected) {
        expect(ids).toContain(id)
      }
    })
  })

  describe('EI-1: duplicate key violation', () => {
    it('fails when duplicate module keys are injected', async () => {
      // Seed a duplicate key violation
      const duplicateKeys = [
        'synthetic.hr-planner',
        'synthetic.hr-planner', // duplicate
        'synthetic.leave-manager',
      ]
      const result = await audit.run({ moduleKeys: duplicateKeys })
      const ei1 = result.perInvariant.find((r) => r.invariantId === 'EI-1')
      expect(ei1).toBeDefined()
      expect(ei1!.passed).toBe(false)
    })

    it('evidence mentions duplicate count on failure', async () => {
      const duplicateKeys = ['synthetic.hr-planner', 'synthetic.hr-planner']
      const result = await audit.run({ moduleKeys: duplicateKeys })
      const ei1 = result.perInvariant.find((r) => r.invariantId === 'EI-1')
      expect(ei1!.evidence).toMatch(/duplicate/)
    })

    it('allPassed=false when EI-1 fails', async () => {
      const duplicateKeys = ['synthetic.hr-planner', 'synthetic.hr-planner']
      const result = await audit.run({ moduleKeys: duplicateKeys })
      expect(result.allPassed).toBe(false)
    })
  })

  describe('individual invariant checks', () => {
    it('EI-4 evidence mentions recall and module count', async () => {
      const result = await audit.run()
      const ei4 = result.perInvariant.find((r) => r.invariantId === 'EI-4')
      expect(ei4!.evidence).toMatch(/recall=/)
      expect(ei4!.evidence).toMatch(/12/)
    })

    it('EI-5 evidence mentions recall and tool count', async () => {
      const result = await audit.run()
      const ei5 = result.perInvariant.find((r) => r.invariantId === 'EI-5')
      expect(ei5!.evidence).toMatch(/recall=/)
      expect(ei5!.evidence).toMatch(/240/)
    })

    it('EI-6 evidence mentions token estimate and budget ceiling', async () => {
      const result = await audit.run()
      const ei6 = result.perInvariant.find((r) => r.invariantId === 'EI-6')
      // 12 × 20 × 30 + 500 = 7700
      expect(ei6!.evidence).toMatch(/7700/)
      expect(ei6!.evidence).toMatch(/8000/)
    })

    it('EI-7 evidence mentions tenant_id', async () => {
      const result = await audit.run()
      const ei7 = result.perInvariant.find((r) => r.invariantId === 'EI-7')
      expect(ei7!.evidence).toMatch(/tenant_id/)
    })

    it('EI-8 evidence mentions BudgetChecker', async () => {
      const result = await audit.run()
      const ei8 = result.perInvariant.find((r) => r.invariantId === 'EI-8')
      expect(ei8!.evidence).toMatch(/BudgetChecker/)
    })

    it('EI-9 evidence mentions DDD boundary lint', async () => {
      const result = await audit.run()
      const ei9 = result.perInvariant.find((r) => r.invariantId === 'EI-9')
      expect(ei9!.evidence).toMatch(/DDD boundary lint/)
    })

    it('EI-10 evidence mentions deprecated', async () => {
      const result = await audit.run()
      const ei10 = result.perInvariant.find((r) => r.invariantId === 'EI-10')
      expect(ei10!.evidence).toMatch(/@deprecated/)
    })
  })
})
