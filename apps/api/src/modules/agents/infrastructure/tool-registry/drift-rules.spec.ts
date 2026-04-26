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
 */

import { describe, it, expect } from 'vitest'
import { initTRPC } from '@trpc/server'
import * as z from 'zod'
import { appRouter } from '../../../../common/trpc/app-router'
import { checkDriftRules } from './drift-rules'
import {
  fixtureEmptyWhenToUse,
  fixtureMutationNoApprovalFreshness,
  fixtureCallArgsSchemaMismatch,
  fixtureTenantIdInInput,
  fixtureAggregateNoCompositionSensitive,
  fixtureArrayOutputNoCollectionContract,
  fixtureObjectCollectionNoCollectionContract,
  fixtureObjectAnyArrayNoCollectionContract,
  fixtureObjectWrappedArrayNoCollectionContract,
  fixtureMutationWithCacheable,
  fixtureQueryWithCacheable,
  fixtureMutationWithoutCacheable,
} from './drift-fixtures'
import type { AgentToolMeta } from '../../../../common/trpc/agent-tool-meta'

// ─── Suite 1: real app router ──────────────────────────────────────────────────

describe('agent tool drift rules — against the real app router', () => {
  it(
    'every .meta({ agent }) tool passes R-01.12 + R-01.17 + R-01.18 + R-01.19 + R-01.19a + R-01.30 + R-14.2' +
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

  // ── Fixture 5: R-01.19 — aggregate output missing compositionSensitive ─────

  it('R-01.19: fails for aggregate output without compositionSensitive', () => {
    const router = fixtureAggregateNoCompositionSensitive()
    const violations = checkDriftRules(router)

    expect(violations.length).toBeGreaterThan(0)

    const r0119 = violations.filter((v) => v.rule === 'R-01.19')
    expect(r0119.length).toBeGreaterThan(0)
    expect(r0119[0].detail).toContain('test.badAggregate')
    expect(r0119[0].detail).toMatch(/compositionSensitive/)
  })

  // ── Fixture 6: R-01.19a — root array output missing collectionContract ─────

  it('R-01.19a: fails for root array output without collectionContract', () => {
    const router = fixtureArrayOutputNoCollectionContract()
    const violations = checkDriftRules(router)

    expect(violations.length).toBeGreaterThan(0)

    const r0119a = violations.filter((v) => v.rule === 'R-01.19a')
    expect(r0119a.length).toBeGreaterThan(0)
    expect(r0119a[0].detail).toContain('test.badArray')
    expect(r0119a[0].detail).toMatch(/collectionContract/)
  })

  // ── Fixture 7: R-01.19a — top-level collection key missing contract ────────

  it('R-01.19a: fails for object output with top-level items array without collectionContract', () => {
    const router = fixtureObjectCollectionNoCollectionContract()
    const violations = checkDriftRules(router)

    expect(violations.length).toBeGreaterThan(0)

    const r0119a = violations.filter((v) => v.rule === 'R-01.19a')
    expect(r0119a.length).toBeGreaterThan(0)
    expect(r0119a[0].detail).toContain('test.badObjectCollection')
    expect(r0119a[0].detail).toMatch(/collectionContract/)
  })

  // ── Fixture 8: R-01.19a — arbitrary top-level array key missing contract ───

  it('R-01.19a: fails for object output with any top-level array property without collectionContract', () => {
    const router = fixtureObjectAnyArrayNoCollectionContract()
    const violations = checkDriftRules(router)

    expect(violations.length).toBeGreaterThan(0)

    const r0119a = violations.filter((v) => v.rule === 'R-01.19a')
    expect(r0119a.length).toBeGreaterThan(0)
    expect(r0119a[0].detail).toContain('test.badObjectAnyArray')
    expect(r0119a[0].detail).toMatch(/collectionContract/)
  })

  // ── Fixture 9: R-01.19a — wrapped top-level array missing contract ─────────

  it('R-01.19a: fails for object output with optional top-level array property without collectionContract', () => {
    const router = fixtureObjectWrappedArrayNoCollectionContract()
    const violations = checkDriftRules(router)

    expect(violations.length).toBeGreaterThan(0)

    const r0119a = violations.filter((v) => v.rule === 'R-01.19a')
    expect(r0119a.length).toBeGreaterThan(0)
    expect(r0119a[0].detail).toContain('test.badObjectWrappedArray')
    expect(r0119a[0].detail).toMatch(/collectionContract/)
  })

  // ── Fixture 10: R-14.2 — mutation with cacheable set ────────────────────────

  it('R-14.2: fails for mutation with cacheable set — violation names the bad tool', () => {
    const router = fixtureMutationWithCacheable()
    const violations = checkDriftRules(router)

    expect(violations.length).toBeGreaterThan(0)

    const r142 = violations.filter((v) => v.rule === 'R-14.2')
    expect(r142.length).toBeGreaterThan(0)
    expect(r142[0].detail).toContain('test.badCacheMutation')
    expect(r142[0].detail).toMatch(/cacheable/)
    expect(r142[0].detail).toMatch(/mutation/)
  })

  // ── Fixture 11: R-14.2 — query with cacheable set (clean) ────────────────────

  it('R-14.2: passes for query with cacheable set — no R-14.2 violation', () => {
    const router = fixtureQueryWithCacheable()
    const violations = checkDriftRules(router)

    const r142 = violations.filter((v) => v.rule === 'R-14.2')
    expect(r142).toEqual([])
  })

  // ── Fixture 12: R-14.2 — mutation without cacheable (clean) ──────────────────

  it('R-14.2: passes for mutation without cacheable — no R-14.2 violation', () => {
    const router = fixtureMutationWithoutCacheable()
    const violations = checkDriftRules(router)

    const r142 = violations.filter((v) => v.rule === 'R-14.2')
    expect(r142).toEqual([])
  })

  // ── Sanity: clean router returns no violations ────────────────────────────────

  it('returns no violations for a clean router with a valid agent tool', () => {
    const tc = initTRPC.meta<{ permission?: string; agent?: AgentToolMeta }>().create()
    const cleanRouter = tc.router({
      test: tc.router({
        goodTool: tc.procedure
          .input(z.object({ id: z.string() }))
          .output(z.object({ id: z.string(), name: z.string() }))
          .meta({
            permission: 'test:good:read',
            agent: {
              whenToUse: 'Use to read an item',
              whenNotToUse: 'Do not use for mutations',
              examples: [{ input: 'Get item by id', callArgs: { id: 'abc' } }],
            },
          })
          .query(() => null),
        goodAggregate: tc.procedure
          .input(z.object({ departmentId: z.string() }))
          .output(
            z.object({
              total: z.number(),
              active: z.number(),
            }),
          )
          .meta({
            permission: 'test:good:read',
            agent: {
              whenToUse: 'Use to summarize people by department',
              whenNotToUse: 'Do not use to list individual people',
              examples: [{ input: 'Summarize department', callArgs: { departmentId: 'dept_1' } }],
              compositionSensitive: { minGroupSize: 5 },
            },
          })
          .query(() => ({ total: 8, active: 7 })),
        goodCollection: tc.procedure
          .input(z.object({ planId: z.string() }))
          .output(
            z.object({
              items: z.array(z.object({ id: z.string(), title: z.string() })),
              nextCursor: z.string().nullable(),
            }),
          )
          .meta({
            permission: 'test:good:read',
            agent: {
              whenToUse: 'Use to list items in a plan',
              whenNotToUse: 'Do not use for writes',
              examples: [{ input: 'List plan items', callArgs: { planId: 'plan_1' } }],
              collectionContract: { pageSize: 50, cursorStyle: 'forward' },
            },
          })
          .query(() => ({ items: [], nextCursor: null })),
      }),
    })

    const violations = checkDriftRules(cleanRouter)
    expect(violations).toEqual([])
  })
})
