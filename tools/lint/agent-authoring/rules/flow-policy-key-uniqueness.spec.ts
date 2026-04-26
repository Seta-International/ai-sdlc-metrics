import { describe, it, expect } from 'vitest'
import type { ParsedFlowPolicy } from '../types'
import { flowPolicyKeyUniquenessRule } from './flow-policy-key-uniqueness'

describe('flowPolicyKeyUniquenessRule', () => {
  it('passes when context has flow-policies with different intentSlugs', () => {
    const flowPolicies: ParsedFlowPolicy[] = [
      {
        intentSlug: 'planner.list-my-plans',
        filePath: 'apps/api/src/modules/planner/agent/policies/list-my-plans.policy.ts',
        line: 8,
      },
      {
        intentSlug: 'projects.list-my-assignments',
        filePath: 'apps/api/src/modules/projects/agent/policies/list-my-assignments.policy.ts',
        line: 8,
      },
    ]

    const result = flowPolicyKeyUniquenessRule.check({
      scope: 'flow-policy',
      filePath: '',
      source: '',
      flowPolicies,
    })

    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('fails with dual-locator findings when two flow-policies share the same intentSlug', () => {
    const policy1: ParsedFlowPolicy = {
      intentSlug: 'planner.list-my-plans',
      filePath: 'apps/api/src/modules/planner/agent/policies/list-my-plans.policy.ts',
      line: 8,
    }

    const policy2: ParsedFlowPolicy = {
      intentSlug: 'planner.list-my-plans',
      filePath: 'apps/api/src/modules/projects/agent/policies/list-my-plans.policy.ts',
      line: 6,
    }

    const result = flowPolicyKeyUniquenessRule.check({
      scope: 'flow-policy',
      filePath: '',
      source: '',
      flowPolicies: [policy1, policy2],
    })

    expect(result.passed).toBe(false)
    expect(result.findings).toHaveLength(2)

    // First finding: at planner policy location, references projects
    const finding1 = result.findings[0]
    expect(finding1.locator).toBe(
      'apps/api/src/modules/planner/agent/policies/list-my-plans.policy.ts:8',
    )
    expect(finding1.message).toContain('planner.list-my-plans')
    expect(finding1.message).toContain(
      'apps/api/src/modules/projects/agent/policies/list-my-plans.policy.ts:6',
    )

    // Second finding: at projects policy location, references planner
    const finding2 = result.findings[1]
    expect(finding2.locator).toBe(
      'apps/api/src/modules/projects/agent/policies/list-my-plans.policy.ts:6',
    )
    expect(finding2.message).toContain('planner.list-my-plans')
    expect(finding2.message).toContain(
      'apps/api/src/modules/planner/agent/policies/list-my-plans.policy.ts:8',
    )
  })

  it('passes when context has empty flowPolicies array', () => {
    const result = flowPolicyKeyUniquenessRule.check({
      scope: 'flow-policy',
      filePath: '',
      source: '',
      flowPolicies: [],
    })

    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('fails with findings only at duplicate slug sites when 3 flow-policies exist with 2 sharing an intentSlug', () => {
    const policy1: ParsedFlowPolicy = {
      intentSlug: 'planner.list-my-plans',
      filePath: 'apps/api/src/modules/planner/agent/policies/list-my-plans.policy.ts',
      line: 8,
    }

    const policy2: ParsedFlowPolicy = {
      intentSlug: 'planner.list-my-plans',
      filePath: 'apps/api/src/modules/projects/agent/policies/list-my-plans.policy.ts',
      line: 6,
    }

    const policy3: ParsedFlowPolicy = {
      intentSlug: 'projects.list-my-assignments',
      filePath: 'apps/api/src/modules/projects/agent/policies/list-my-assignments.policy.ts',
      line: 12,
    }

    const result = flowPolicyKeyUniquenessRule.check({
      scope: 'flow-policy',
      filePath: '',
      source: '',
      flowPolicies: [policy1, policy2, policy3],
    })

    expect(result.passed).toBe(false)
    expect(result.findings).toHaveLength(2)

    // Only the two policies with duplicate intentSlug should have findings
    const locators = result.findings.map((f) => f.locator).sort()
    expect(locators).toEqual([
      'apps/api/src/modules/planner/agent/policies/list-my-plans.policy.ts:8',
      'apps/api/src/modules/projects/agent/policies/list-my-plans.policy.ts:6',
    ])
  })

  it('produces findings for all sites when more than 2 flow-policies share the same intentSlug', () => {
    const policy1: ParsedFlowPolicy = {
      intentSlug: 'shared.action',
      filePath: 'path/to/policy1.ts',
      line: 5,
    }

    const policy2: ParsedFlowPolicy = {
      intentSlug: 'shared.action',
      filePath: 'path/to/policy2.ts',
      line: 10,
    }

    const policy3: ParsedFlowPolicy = {
      intentSlug: 'shared.action',
      filePath: 'path/to/policy3.ts',
      line: 15,
    }

    const result = flowPolicyKeyUniquenessRule.check({
      scope: 'flow-policy',
      filePath: '',
      source: '',
      flowPolicies: [policy1, policy2, policy3],
    })

    expect(result.passed).toBe(false)
    expect(result.findings).toHaveLength(3)

    // All three should have findings
    const locators = result.findings.map((f) => f.locator).sort()
    expect(locators).toEqual([
      'path/to/policy1.ts:5',
      'path/to/policy2.ts:10',
      'path/to/policy3.ts:15',
    ])

    // Each finding should reference at least one other location
    result.findings.forEach((finding) => {
      expect(finding.message).toContain('shared.action')
      // Count how many other locators are mentioned in the message
      const mentionedLocators = [
        'path/to/policy1.ts:5',
        'path/to/policy2.ts:10',
        'path/to/policy3.ts:15',
      ].filter((loc) => loc !== finding.locator && finding.message.includes(loc))

      expect(mentionedLocators.length).toBeGreaterThan(0)
    })
  })
})
