import { describe, it, expect } from 'vitest'
import type { ParsedIntent } from '../types'
import { intentSlugUniquenessRule } from './intent-slug-uniqueness'

describe('intentSlugUniquenessRule', () => {
  it('passes when context has intents with different slugs', () => {
    const intents: ParsedIntent[] = [
      {
        slug: 'planner.list-my-plans',
        domain: 'planner',
        filePath: 'apps/api/src/modules/planner/agent/intents/list-my-plans.ts',
        line: 7,
      },
      {
        slug: 'projects.list-my-assignments',
        domain: 'projects',
        filePath: 'apps/api/src/modules/projects/agent/intents/list-my-assignments.ts',
        line: 7,
      },
    ]

    const result = intentSlugUniquenessRule.check({
      scope: 'intent',
      filePath: '',
      source: '',
      intents,
    })

    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('fails with dual-locator findings when two intents share the same slug', () => {
    const plannerIntent: ParsedIntent = {
      slug: 'planner.list-my-plans',
      domain: 'planner',
      filePath: 'apps/api/src/modules/planner/agent/intents/list-my-plans.ts',
      line: 7,
    }

    const duplicateIntent: ParsedIntent = {
      slug: 'planner.list-my-plans',
      domain: 'projects',
      filePath: 'apps/api/src/modules/projects/agent/intents/list-my-plans.ts',
      line: 5,
    }

    const result = intentSlugUniquenessRule.check({
      scope: 'intent',
      filePath: '',
      source: '',
      intents: [plannerIntent, duplicateIntent],
    })

    expect(result.passed).toBe(false)
    expect(result.findings).toHaveLength(2)

    // First finding: at planner intent location, references projects
    const finding1 = result.findings[0]
    expect(finding1.locator).toBe('apps/api/src/modules/planner/agent/intents/list-my-plans.ts:7')
    expect(finding1.message).toContain('planner.list-my-plans')
    expect(finding1.message).toContain(
      'apps/api/src/modules/projects/agent/intents/list-my-plans.ts:5',
    )

    // Second finding: at projects intent location, references planner
    const finding2 = result.findings[1]
    expect(finding2.locator).toBe('apps/api/src/modules/projects/agent/intents/list-my-plans.ts:5')
    expect(finding2.message).toContain('planner.list-my-plans')
    expect(finding2.message).toContain(
      'apps/api/src/modules/planner/agent/intents/list-my-plans.ts:7',
    )
  })

  it('passes when context has empty intents array', () => {
    const result = intentSlugUniquenessRule.check({
      scope: 'intent',
      filePath: '',
      source: '',
      intents: [],
    })

    expect(result.passed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('fails with findings only at duplicate slug sites when 3 intents exist with 2 sharing a slug', () => {
    const intent1: ParsedIntent = {
      slug: 'planner.list-my-plans',
      domain: 'planner',
      filePath: 'apps/api/src/modules/planner/agent/intents/list-my-plans.ts',
      line: 7,
    }

    const intent2: ParsedIntent = {
      slug: 'planner.list-my-plans',
      domain: 'projects',
      filePath: 'apps/api/src/modules/projects/agent/intents/list-my-plans.ts',
      line: 5,
    }

    const intent3: ParsedIntent = {
      slug: 'projects.list-my-assignments',
      domain: 'projects',
      filePath: 'apps/api/src/modules/projects/agent/intents/list-my-assignments.ts',
      line: 10,
    }

    const result = intentSlugUniquenessRule.check({
      scope: 'intent',
      filePath: '',
      source: '',
      intents: [intent1, intent2, intent3],
    })

    expect(result.passed).toBe(false)
    expect(result.findings).toHaveLength(2)

    // Only the two intents with duplicate slug should have findings
    const locators = result.findings.map((f) => f.locator).sort()
    expect(locators).toEqual([
      'apps/api/src/modules/planner/agent/intents/list-my-plans.ts:7',
      'apps/api/src/modules/projects/agent/intents/list-my-plans.ts:5',
    ])
  })

  it('produces findings for all sites when more than 2 intents share the same slug', () => {
    const intent1: ParsedIntent = {
      slug: 'shared.action',
      domain: 'domain1',
      filePath: 'path/to/intent1.ts',
      line: 5,
    }

    const intent2: ParsedIntent = {
      slug: 'shared.action',
      domain: 'domain2',
      filePath: 'path/to/intent2.ts',
      line: 10,
    }

    const intent3: ParsedIntent = {
      slug: 'shared.action',
      domain: 'domain3',
      filePath: 'path/to/intent3.ts',
      line: 15,
    }

    const result = intentSlugUniquenessRule.check({
      scope: 'intent',
      filePath: '',
      source: '',
      intents: [intent1, intent2, intent3],
    })

    expect(result.passed).toBe(false)
    expect(result.findings).toHaveLength(3)

    // All three should have findings
    const locators = result.findings.map((f) => f.locator).sort()
    expect(locators).toEqual([
      'path/to/intent1.ts:5',
      'path/to/intent2.ts:10',
      'path/to/intent3.ts:15',
    ])

    // Each finding should reference at least one other location
    result.findings.forEach((finding) => {
      expect(finding.message).toContain('shared.action')
      // Count how many other locators are mentioned in the message
      const mentionedLocators = [
        'path/to/intent1.ts:5',
        'path/to/intent2.ts:10',
        'path/to/intent3.ts:15',
      ].filter((loc) => loc !== finding.locator && finding.message.includes(loc))

      expect(mentionedLocators.length).toBeGreaterThan(0)
    })
  })
})
