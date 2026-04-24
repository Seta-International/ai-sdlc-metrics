/**
 * draft-tier-classifier.spec.ts — Plan 08 T2
 *
 * Covers DraftTierClassifier.classify() priority rules:
 *   1. approvalRequired === 'always' → high_risk, reason: tool_always_requires_approval
 *   2. tainted turn + mutation → high_risk, reason: taint_bump
 *   3. tainted turn + non-mutation → NOT bumped (taint only applies to mutations)
 *   4. tenant policy upgrade for this tool → high_risk, reason: tenant_policy_override
 *   5. tenant policy cannot downgrade a globally-high-risk tool
 *   6. default (no special flags) → low_risk_auto, reason: tool_default
 *   7. tool declares defaultTier: high_risk_approval_required → returned as-is
 */

import { describe, it, expect } from 'vitest'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import type { TurnState } from './tool-gateway-contracts'
import type { TenantApprovalPolicy } from './draft-types'
import { DraftTierClassifier } from './draft-tier-classifier'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function buildTurnState(tainted: boolean): TurnState {
  return {
    tainted: { value: tainted },
    circuitBreaker: new Map(),
    retryCount: new Map(),
    toolCeilingRemaining: new Map(),
    l1Cache: {} as never,
  }
}

function buildTool(overrides: Partial<AgentToolDescriptor> = {}): AgentToolDescriptor {
  return {
    name: 'people.listEmployees',
    procedure: 'query',
    permission: 'people:employees:read',
    inputSchema: {},
    outputSchema: {},
    meta: {
      whenToUse: 'List employees',
      whenNotToUse: 'Single lookup',
      examples: [{ input: 'list', callArgs: {} }],
    },
    ...overrides,
  }
}

function buildMutationTool(overrides: Partial<AgentToolDescriptor> = {}): AgentToolDescriptor {
  return buildTool({
    name: 'time.submitLeave',
    procedure: 'mutation',
    permission: 'time:leave:submit',
    meta: {
      whenToUse: 'Submit leave',
      whenNotToUse: 'Read leave',
      examples: [{ input: 'take leave', callArgs: {} }],
      approvalFreshness: 'revalidate',
    },
    ...overrides,
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DraftTierClassifier', () => {
  const classifier = new DraftTierClassifier()

  describe('classify()', () => {
    it('1. tool.meta.approvalRequired === "always" → high_risk_approval_required, reason: tool_always_requires_approval', () => {
      const tool = buildMutationTool({
        meta: {
          whenToUse: 'Delete employee',
          whenNotToUse: 'Read data',
          examples: [{ input: 'delete', callArgs: {} }],
          approvalFreshness: 'revalidate',
          approvalRequired: 'always',
        },
      })

      const result = classifier.classify({
        tool,
        turnState: buildTurnState(false),
      })

      expect(result.tier).toBe('high_risk_approval_required')
      expect(result.reason).toBe('tool_always_requires_approval')
    })

    it('2. tainted turn + mutation tool → high_risk_approval_required, reason: taint_bump', () => {
      const tool = buildMutationTool()

      const result = classifier.classify({
        tool,
        turnState: buildTurnState(true),
      })

      expect(result.tier).toBe('high_risk_approval_required')
      expect(result.reason).toBe('taint_bump')
    })

    it('3. tainted turn + non-mutation tool → NOT bumped (taint only applies to mutations)', () => {
      const tool = buildTool({ procedure: 'query' })

      const result = classifier.classify({
        tool,
        turnState: buildTurnState(true),
      })

      expect(result.tier).toBe('low_risk_auto')
      expect(result.reason).toBe('tool_default')
    })

    it('4. tenant policy has override for this tool → high_risk_approval_required, reason: tenant_policy_override', () => {
      const tool = buildMutationTool()
      const policy: TenantApprovalPolicy = {
        tier_overrides_by_tool: {
          'time.submitLeave': 'high_risk_approval_required',
        },
      }

      const result = classifier.classify({
        tool,
        turnState: buildTurnState(false),
        tenantPolicy: policy,
      })

      expect(result.tier).toBe('high_risk_approval_required')
      expect(result.reason).toBe('tenant_policy_override')
    })

    it('5. tenant policy cannot downgrade a tool already high-risk via approvalRequired', () => {
      const tool = buildMutationTool({
        meta: {
          whenToUse: 'Delete',
          whenNotToUse: 'Read',
          examples: [{ input: 'delete', callArgs: {} }],
          approvalFreshness: 'revalidate',
          approvalRequired: 'always',
        },
      })
      // Policy with no override for this tool — only upgrade-only rule matters here
      // (policy cannot set tier to low_risk; overrides map only accepts high_risk values)
      const policy: TenantApprovalPolicy = {
        tier_overrides_by_tool: {
          // tool is already high_risk from approvalRequired — policy override still high_risk
          'time.submitLeave': 'high_risk_approval_required',
        },
      }

      const result = classifier.classify({
        tool,
        turnState: buildTurnState(false),
        tenantPolicy: policy,
      })

      // approvalRequired rule wins (rule 1 has priority) — not the policy override
      expect(result.tier).toBe('high_risk_approval_required')
      expect(result.reason).toBe('tool_always_requires_approval')
    })

    it('5b. tenant policy cannot downgrade a tool that became high_risk via taint_bump', () => {
      // This test demonstrates upgrade-only: policy can only RAISE to high_risk,
      // not lower it. Since TenantApprovalPolicy only allows 'high_risk_approval_required'
      // as override values, a downgrade is architecturally impossible via the type system.
      // The implementation must still return the taint_bump tier when rule 2 fires.
      const tool = buildMutationTool()
      const policy: TenantApprovalPolicy = {
        // no override for 'time.submitLeave' — but taint already bumps it
      }

      const result = classifier.classify({
        tool,
        turnState: buildTurnState(true),
        tenantPolicy: policy,
      })

      expect(result.tier).toBe('high_risk_approval_required')
      expect(result.reason).toBe('taint_bump')
    })

    it('6. default case → low_risk_auto, reason: tool_default', () => {
      const tool = buildTool()

      const result = classifier.classify({
        tool,
        turnState: buildTurnState(false),
      })

      expect(result.tier).toBe('low_risk_auto')
      expect(result.reason).toBe('tool_default')
    })

    it('7. tool declares defaultTier: high_risk_approval_required → returned with reason tool_default', () => {
      const tool = buildMutationTool({
        meta: {
          whenToUse: 'Bulk delete',
          whenNotToUse: 'Single ops',
          examples: [{ input: 'bulk delete', callArgs: {} }],
          approvalFreshness: 'revalidate',
          defaultTier: 'high_risk_approval_required',
        },
      })

      const result = classifier.classify({
        tool,
        turnState: buildTurnState(false),
      })

      expect(result.tier).toBe('high_risk_approval_required')
      expect(result.reason).toBe('tool_default')
    })

    it('8. approvalRequired=always wins even when turn is also tainted', () => {
      const tool = buildMutationTool({
        meta: {
          whenToUse: 'Delete',
          whenNotToUse: 'Read',
          examples: [{ input: 'delete', callArgs: {} }],
          approvalFreshness: 'revalidate',
          approvalRequired: 'always',
        },
      })

      const result = classifier.classify({
        tool,
        turnState: buildTurnState(true),
      })

      // Rule 1 wins over rule 2 — priority is strict
      expect(result.tier).toBe('high_risk_approval_required')
      expect(result.reason).toBe('tool_always_requires_approval')
    })
  })
})
