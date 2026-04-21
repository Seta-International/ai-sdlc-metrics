/**
 * drift-rules.spec.ts — vitest suite for the agent tool drift checker.
 *
 * Two describe blocks:
 *   1. Against the real (static) app router — vacuously passes today because no
 *      procedures carry `.meta({ agent: {...} })` yet (pre-Plan 02). The seeded
 *      fixtures below are the load-bearing coverage until Plan 02 adds real tools.
 *
 *   2. Seeded-failure fixtures — one per rule, each asserting that the drift walker
 *      DOES fire for a deliberately broken router.
 *
 * DEFERRED checks (not enforced here — see plan 15):
 *   R-01.19  compositionSensitive on aggregate-returning tools
 *   R-01.19a collectionContract on array-returning tools
 *   Both deferred because output-shape introspection is unreliable in tRPC v11.
 */

import { describe, it, expect } from 'vitest'
import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { appRouter } from '../../../../common/trpc/app-router'
import { checkDriftRules } from './drift-rules'
import {
  fixtureEmptyWhenToUse,
  fixtureMutationNoApprovalFreshness,
  fixtureCallArgsSchemaMismatch,
  fixtureTenantIdInInput,
} from './drift-fixtures'
import type { AgentToolMeta } from '../../../../common/trpc/agent-tool-meta'

// ─── Suite 1: real app router ──────────────────────────────────────────────────

describe('agent tool drift rules — against the real app router', () => {
  it(
    'every .meta({ agent }) tool passes R-01.12 + R-01.17 + R-01.18 + R-01.30' +
      ' (vacuously passes pre-Plan 02 — no agent tools registered yet)',
    () => {
      // Use the static `appRouter` export (built at module load time from default routers).
      // This does NOT require NestJS bootstrap — it uses the default unprotected routers,
      // which is fine for structural drift checks. The initialized router (post-TrpcModule.onModuleInit)
      // carries the same procedure set; only the middleware chain differs.
      const violations = checkDriftRules(appRouter)
      expect(violations).toEqual([])
    },
  )
})

// ─── Suite 2: seeded-failure fixtures ─────────────────────────────────────────

describe('drift walker — seeded failures', () => {
  // ── Fixture 1: R-01.12 — empty whenToUse ────────────────────────────────────

  it('R-01.12: fails when whenToUse is empty — violation names the bad tool', () => {
    const router = fixtureEmptyWhenToUse()
    const violations = checkDriftRules(router)

    expect(violations.length).toBeGreaterThan(0)

    const r0112 = violations.filter((v) => v.rule === 'R-01.12')
    expect(r0112.length).toBeGreaterThan(0)

    // The violation detail must name the offending tool
    const detail = r0112[0].detail
    expect(detail).toContain('test.badTool')
    expect(detail).toMatch(/whenToUse/)
  })

  // ── Fixture 2: R-01.18 — mutation without approvalFreshness ─────────────────

  it('R-01.18: fails for mutation without approvalFreshness — violation names the bad tool', () => {
    const router = fixtureMutationNoApprovalFreshness()
    const violations = checkDriftRules(router)

    expect(violations.length).toBeGreaterThan(0)

    const r0118 = violations.filter((v) => v.rule === 'R-01.18')
    expect(r0118.length).toBeGreaterThan(0)
    expect(r0118[0].detail).toContain('test.badMutation')
    expect(r0118[0].detail).toMatch(/approvalFreshness/)
  })

  // ── Fixture 3: R-01.17 — callArgs schema mismatch ───────────────────────────

  it('R-01.17: fails when example callArgs does not parse against input schema', () => {
    const router = fixtureCallArgsSchemaMismatch()
    const violations = checkDriftRules(router)

    expect(violations.length).toBeGreaterThan(0)

    const r0117 = violations.filter((v) => v.rule === 'R-01.17')
    expect(r0117.length).toBeGreaterThan(0)
    expect(r0117[0].detail).toContain('test.badExample')
    expect(r0117[0].detail).toMatch(/callArgs/)
  })

  // ── Fixture 4: R-01.30 — tenant_id in input schema ──────────────────────────

  it('R-01.30: fails when input schema contains tenant_id field', () => {
    const router = fixtureTenantIdInInput()
    const violations = checkDriftRules(router)

    expect(violations.length).toBeGreaterThan(0)

    const r0130 = violations.filter((v) => v.rule === 'R-01.30')
    expect(r0130.length).toBeGreaterThan(0)
    expect(r0130[0].detail).toContain('test.badInput')
    expect(r0130[0].detail).toMatch(/tenant_id/)
  })

  // ── Sanity: clean router returns no violations ────────────────────────────────

  it('returns no violations for a clean router with a valid agent tool', () => {
    const tc = initTRPC.meta<{ permission?: string; agent?: AgentToolMeta }>().create()
    const cleanRouter = tc.router({
      test: tc.router({
        goodTool: tc.procedure
          .input(z.object({ id: z.string() }))
          .meta({
            permission: 'test:good:read',
            agent: {
              whenToUse: 'Use to read an item',
              whenNotToUse: 'Do not use for mutations',
              examples: [{ input: 'Get item by id', callArgs: { id: 'abc' } }],
            },
          })
          .query(() => null),
      }),
    })

    const violations = checkDriftRules(cleanRouter)
    expect(violations).toEqual([])
  })
})
