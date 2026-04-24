/**
 * flow-policy-resolver.spec.ts — Plan 08 T2
 *
 * Covers FlowPolicyResolver.resolve() precedence rules:
 *   1. no policy for intent_slug → tool-meta defaults
 *   2. flow-policy requireFresh: true → forces 'revalidate' regardless of tool-meta
 *   3. flow-policy approvalFreshness 'revalidate' beats tool 'accept-stale' (max rule)
 *   4. flow-policy approvalTtlHours shorter than tool-meta ttl → shorter wins (min rule)
 *   5. flow-policy bump → adds tierBump to result
 *   6. default TTL (72h) when neither flow nor tool specifies
 *   7. tool-meta 'revalidate' beats flow-policy 'accept-stale' (max rule is symmetric)
 *   8. flow-policy ttl longer than tool-meta ttl → tool-meta (shorter) wins
 */

import { describe, it, expect } from 'vitest'
import type { AgentToolMeta } from '../../../../common/trpc/agent-tool-meta'
import { FlowPolicyResolver } from './flow-policy-resolver'
import type { FlowPolicyEntry } from './flow-policy-resolver'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function buildMeta(overrides: Partial<AgentToolMeta> = {}): AgentToolMeta {
  return {
    whenToUse: 'Use when...',
    whenNotToUse: 'Do not use when...',
    examples: [{ input: 'example', callArgs: {} }],
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FlowPolicyResolver', () => {
  describe('resolve()', () => {
    it('1. no registered policy for intent_slug → tool-meta defaults', () => {
      const resolver = new FlowPolicyResolver()
      const meta = buildMeta({ approvalFreshness: 'accept-stale', approvalTtl: '48h' })

      const result = resolver.resolve('time.leave-request', meta)

      expect(result.approvalFreshness).toBe('accept-stale')
      expect(result.approvalTtlHours).toBe(48)
      expect(result.tierBump).toBeUndefined()
    })

    it('2. flow-policy requireFresh: true → forces approvalFreshness to revalidate', () => {
      const resolver = new FlowPolicyResolver()
      const entry: FlowPolicyEntry = {
        intent_slug: 'time.overtime-request',
        requireFresh: true,
      }
      resolver.registerPolicy(entry)

      // tool-meta says accept-stale; flow says requireFresh → must become revalidate
      const meta = buildMeta({ approvalFreshness: 'accept-stale' })
      const result = resolver.resolve('time.overtime-request', meta)

      expect(result.approvalFreshness).toBe('revalidate')
    })

    it('3. flow-policy approvalFreshness "revalidate" beats tool "accept-stale" (max rule)', () => {
      const resolver = new FlowPolicyResolver()
      resolver.registerPolicy({
        intent_slug: 'finance.budget-request',
        approvalFreshness: 'revalidate',
      })

      const meta = buildMeta({ approvalFreshness: 'accept-stale' })
      const result = resolver.resolve('finance.budget-request', meta)

      expect(result.approvalFreshness).toBe('revalidate')
    })

    it('4. flow-policy approvalTtlHours shorter than tool-meta → shorter wins (min rule)', () => {
      const resolver = new FlowPolicyResolver()
      resolver.registerPolicy({
        intent_slug: 'hiring.offer-approval',
        approvalTtlHours: 24,
      })

      const meta = buildMeta({ approvalTtl: '72h' })
      const result = resolver.resolve('hiring.offer-approval', meta)

      expect(result.approvalTtlHours).toBe(24)
    })

    it('5. flow-policy has bump → tierBump present in result', () => {
      const resolver = new FlowPolicyResolver()
      resolver.registerPolicy({
        intent_slug: 'performance.termination',
        bump: 'high_risk_approval_required',
      })

      const meta = buildMeta()
      const result = resolver.resolve('performance.termination', meta)

      expect(result.tierBump).toBe('high_risk_approval_required')
    })

    it('6. default TTL (72h) when neither flow nor tool specifies', () => {
      const resolver = new FlowPolicyResolver()
      const meta = buildMeta() // no approvalTtl

      const result = resolver.resolve('unknown.intent', meta)

      expect(result.approvalTtlHours).toBe(72)
    })

    it('7. tool-meta "revalidate" beats flow-policy "accept-stale" (max rule is symmetric)', () => {
      const resolver = new FlowPolicyResolver()
      resolver.registerPolicy({
        intent_slug: 'goals.target-update',
        approvalFreshness: 'accept-stale',
      })

      const meta = buildMeta({ approvalFreshness: 'revalidate' })
      const result = resolver.resolve('goals.target-update', meta)

      expect(result.approvalFreshness).toBe('revalidate')
    })

    it('8. flow-policy ttl longer than tool-meta → tool-meta (shorter) wins', () => {
      const resolver = new FlowPolicyResolver()
      resolver.registerPolicy({
        intent_slug: 'people.update-salary',
        approvalTtlHours: 120,
      })

      const meta = buildMeta({ approvalTtl: '48h' })
      const result = resolver.resolve('people.update-salary', meta)

      expect(result.approvalTtlHours).toBe(48)
    })

    it('9. no flow policy and no tool freshness → defaults to accept-stale', () => {
      const resolver = new FlowPolicyResolver()
      const meta = buildMeta() // no approvalFreshness

      const result = resolver.resolve('unknown.intent', meta)

      expect(result.approvalFreshness).toBe('accept-stale')
    })

    it('10. registerPolicy then resolve unknown slug → still returns tool defaults', () => {
      const resolver = new FlowPolicyResolver()
      resolver.registerPolicy({
        intent_slug: 'some.known.intent',
        approvalFreshness: 'revalidate',
        approvalTtlHours: 24,
      })

      const meta = buildMeta({ approvalFreshness: 'accept-stale', approvalTtl: '72h' })
      const result = resolver.resolve('other.unknown.intent', meta)

      // Different slug — policy should not apply
      expect(result.approvalFreshness).toBe('accept-stale')
      expect(result.approvalTtlHours).toBe(72)
    })
  })
})
