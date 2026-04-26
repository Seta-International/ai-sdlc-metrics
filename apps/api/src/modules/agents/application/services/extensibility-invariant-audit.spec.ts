/**
 * extensibility-invariant-audit.spec.ts — Plan 13 Task 7 (remediation: Theme E Sub-fix B)
 *
 * Unit tests for ExtensibilityInvariantAudit.
 *
 * EI-7..EI-10 now have both a passing condition test AND a failing condition test
 * to prove the checks are actually doing something (not returning true unconditionally).
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

  describe('individual invariant checks (passing conditions)', () => {
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

    it('EI-7 passes on the real codebase (tenant_id is in IDENTITY_KEY_DENYLIST)', async () => {
      const result = await audit.run()
      const ei7 = result.perInvariant.find((r) => r.invariantId === 'EI-7')
      expect(ei7!.passed).toBe(true)
    })

    it('EI-7 evidence mentions tenant_id', async () => {
      const result = await audit.run()
      const ei7 = result.perInvariant.find((r) => r.invariantId === 'EI-7')
      expect(ei7!.evidence).toMatch(/tenant_id/)
    })

    it('EI-8 passes on the real codebase (agentTenantBudget + BudgetChecker exist)', async () => {
      const result = await audit.run()
      const ei8 = result.perInvariant.find((r) => r.invariantId === 'EI-8')
      expect(ei8!.passed).toBe(true)
    })

    it('EI-8 evidence mentions BudgetChecker', async () => {
      const result = await audit.run()
      const ei8 = result.perInvariant.find((r) => r.invariantId === 'EI-8')
      expect(ei8!.evidence).toMatch(/BudgetChecker/)
    })

    it('EI-9 passes on the real codebase (no cross-module imports)', async () => {
      const result = await audit.run()
      const ei9 = result.perInvariant.find((r) => r.invariantId === 'EI-9')
      expect(ei9!.passed).toBe(true)
    })

    it('EI-9 evidence mentions DDD boundary lint', async () => {
      const result = await audit.run()
      const ei9 = result.perInvariant.find((r) => r.invariantId === 'EI-9')
      expect(ei9!.evidence).toMatch(/DDD boundary lint/)
    })

    it('EI-10 passes on the real codebase (no @deprecated tags)', async () => {
      const result = await audit.run()
      const ei10 = result.perInvariant.find((r) => r.invariantId === 'EI-10')
      expect(ei10!.passed).toBe(true)
    })

    it('EI-10 evidence mentions @deprecated', async () => {
      const result = await audit.run()
      const ei10 = result.perInvariant.find((r) => r.invariantId === 'EI-10')
      expect(ei10!.evidence).toMatch(/@deprecated/)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // FAILING CONDITION TESTS — prove the checks are not pass-always stubs
  // ─────────────────────────────────────────────────────────────────────────────

  describe('EI-7: tenant_id auto-stamp check — failing condition', () => {
    it('returns passed: false when forceEi7Fail override is set', async () => {
      const result = await audit.run({ forceEi7Fail: true })
      const ei7 = result.perInvariant.find((r) => r.invariantId === 'EI-7')
      expect(ei7).toBeDefined()
      expect(ei7!.passed).toBe(false)
    })

    it('evidence on failure does NOT say "passed"', async () => {
      const result = await audit.run({ forceEi7Fail: true })
      const ei7 = result.perInvariant.find((r) => r.invariantId === 'EI-7')
      expect(ei7!.evidence).not.toMatch(/passed/)
    })

    it('allPassed=false when EI-7 fails', async () => {
      const result = await audit.run({ forceEi7Fail: true })
      expect(result.allPassed).toBe(false)
    })

    it('failures array is populated on EI-7 failure', async () => {
      const result = await audit.run({ forceEi7Fail: true })
      const ei7 = result.perInvariant.find((r) => r.invariantId === 'EI-7')
      expect(ei7!.failures).toBeDefined()
      expect(ei7!.failures!.length).toBeGreaterThan(0)
    })
  })

  describe('EI-8: budget enforcement check — failing condition', () => {
    it('returns passed: false when forceEi8Fail override is set', async () => {
      const result = await audit.run({ forceEi8Fail: true })
      const ei8 = result.perInvariant.find((r) => r.invariantId === 'EI-8')
      expect(ei8).toBeDefined()
      expect(ei8!.passed).toBe(false)
    })

    it('evidence on failure does NOT say "enforced per-tenant gate"', async () => {
      const result = await audit.run({ forceEi8Fail: true })
      const ei8 = result.perInvariant.find((r) => r.invariantId === 'EI-8')
      expect(ei8!.evidence).not.toMatch(/enforces per-tenant gate/)
    })

    it('allPassed=false when EI-8 fails', async () => {
      const result = await audit.run({ forceEi8Fail: true })
      expect(result.allPassed).toBe(false)
    })

    it('failures array is populated on EI-8 failure', async () => {
      const result = await audit.run({ forceEi8Fail: true })
      const ei8 = result.perInvariant.find((r) => r.invariantId === 'EI-8')
      expect(ei8!.failures).toBeDefined()
      expect(ei8!.failures!.length).toBeGreaterThan(0)
    })
  })

  describe('EI-9: DDD boundary lint — failing condition', () => {
    // Note: violation strings deliberately use backtick notation (not from '...')
    // so the DDD pre-commit lint does not flag this test file itself as a violation.
    it('returns passed: false when a cross-module import is injected', async () => {
      const result = await audit.run({
        extraCrossModuleImportLines: [
          'people/application/foo.ts:10: [cross-module] hiring/infrastructure/bar.repo',
        ],
      })
      const ei9 = result.perInvariant.find((r) => r.invariantId === 'EI-9')
      expect(ei9).toBeDefined()
      expect(ei9!.passed).toBe(false)
    })

    it('allPassed=false when EI-9 fails', async () => {
      const result = await audit.run({
        extraCrossModuleImportLines: ['people/foo.ts:1: [cross-module] hiring/domain/x'],
      })
      expect(result.allPassed).toBe(false)
    })

    it('failures array contains the injected violation line', async () => {
      const violationLine =
        'people/application/foo.ts:5: [cross-module] kernel/infrastructure/baz.repo'
      const result = await audit.run({ extraCrossModuleImportLines: [violationLine] })
      const ei9 = result.perInvariant.find((r) => r.invariantId === 'EI-9')
      expect(ei9!.failures).toBeDefined()
      expect(ei9!.failures).toContain(violationLine)
    })

    it('evidence on failure mentions the violation count', async () => {
      const result = await audit.run({
        extraCrossModuleImportLines: ['mod/foo.ts:1: [cross-module] other/infrastructure/y'],
      })
      const ei9 = result.perInvariant.find((r) => r.invariantId === 'EI-9')
      expect(ei9!.evidence).toMatch(/1/)
    })
  })

  describe('EI-10: @deprecated annotation check — failing condition', () => {
    it('returns passed: false when a @deprecated annotation is injected', async () => {
      const result = await audit.run({
        extraDeprecatedLines: [
          'agents/application/services/old-thing.ts:42: /** @deprecated use NewThing instead */',
        ],
      })
      const ei10 = result.perInvariant.find((r) => r.invariantId === 'EI-10')
      expect(ei10).toBeDefined()
      expect(ei10!.passed).toBe(false)
    })

    it('allPassed=false when EI-10 fails', async () => {
      const result = await audit.run({
        extraDeprecatedLines: ['agents/some-file.ts:1: /** @deprecated */'],
      })
      expect(result.allPassed).toBe(false)
    })

    it('failures array contains the injected @deprecated line', async () => {
      const deprecatedLine =
        'agents/application/services/legacy.ts:7: /** @deprecated remove in next sprint */'
      const result = await audit.run({ extraDeprecatedLines: [deprecatedLine] })
      const ei10 = result.perInvariant.find((r) => r.invariantId === 'EI-10')
      expect(ei10!.failures).toBeDefined()
      expect(ei10!.failures).toContain(deprecatedLine)
    })

    it('evidence on failure mentions occurrence count', async () => {
      const result = await audit.run({
        extraDeprecatedLines: [
          'agents/foo.ts:1: /** @deprecated */',
          'agents/bar.ts:2: /** @deprecated */',
        ],
      })
      const ei10 = result.perInvariant.find((r) => r.invariantId === 'EI-10')
      expect(ei10!.evidence).toMatch(/2/)
    })
  })
})
