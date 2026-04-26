import { describe, it, expect } from 'vitest'
import {
  parseOverrideComments,
  detectProcedureType,
  parseToolMetas,
  parseSubAgents,
  parseIntents,
  parseFlowPolicies,
} from './file-parser'

// ---------------------------------------------------------------------------
// Fixtures — inline source strings that mirror actual codebase files
// ---------------------------------------------------------------------------

const LIST_MY_PLANS_SOURCE = `
/**
 * planner.list-my-plans — user wants to see their own plans.
 */

import type { IntentDescriptor } from '../../../agents/declare'

export const listMyPlansIntent: IntentDescriptor = {
  slug: 'planner.list-my-plans',
  domain: 'planner',
  description:
    'User is asking about their own plan list, plan names, or high-level plan status — not individual tasks within a plan.',
}
`

const LIST_MY_TASKS_SOURCE = `
import type { IntentDescriptor } from '../../../agents/declare'

export const listMyTasksIntent: IntentDescriptor = {
  slug: 'planner.list-my-tasks',
  domain: 'planner',
  description: 'User is asking about their own open tasks, upcoming work, or task details.',
}
`

const LIST_EVIDENCE_SOURCE = `
import type { IntentDescriptor } from '../../../agents/declare'

export const listEvidenceIntent: IntentDescriptor = {
  slug: 'planner.list-evidence',
  domain: 'planner',
  description: 'User is asking about evidence they contributed.',
}
`

const PLANNER_READ_ONLY_SOURCE = `
import * as z from 'zod'
import { defineSubAgent } from '../../../agents/declare'

export const plannerReadOnlySubAgent = defineSubAgent({
  key: 'planner.read-only',
  domain: 'planner',
  description:
    'Surfaces tasks, plans, and evidence owned by the caller or visible to them by role.',
  whenToUse:
    'Use when the user asks about their own tasks, plans, upcoming work, or evidence they have contributed. Do not use for task creation or mutation.',
  promptTemplate: {
    body: 'You are a read-only planner assistant.',
    variables: z.object({
      userDisplayName: z.string().min(1),
    }),
  },
  inputSchema: z.object({
    utterance: z.string().min(1),
  }),
  outputSchema: z.object({
    summary: z.string(),
  }),
  toolScope: ['planner.personal.listTasks', 'planner.personal.listPlans'],
  source: 'code',
})
`

const PERSONAL_ROUTER_SOURCE = `
import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'

export const personalRouter = router({
  listPlans: publicProcedure
    .meta({
      permission: PERMISSIONS.PLANNER_AGENT_LIST_MY_PLANS,
      agent: {
        whenToUse:
          'Use when the user asks to see the plans (projects/boards) they are a member of or own.',
        whenNotToUse:
          'Do not use to create, rename, or delete plans. Do not use to list tasks within a plan.',
        examples: [
          {
            input: 'Show me my plans',
            callArgs: {
              actorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
              tenantId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            },
          },
          {
            input: 'What plans am I part of?',
            callArgs: {
              actorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
              tenantId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            },
          },
        ],
      },
    })
    .input(z.object({ actorId: z.string().uuid() }))
    .query(async ({ input }) => {
      return svc().query(new ListPlansForActorQuery(input.actorId))
    }),

  listTasks: publicProcedure
    .meta({
      permission: PERMISSIONS.PLANNER_AGENT_LIST_MY_TASKS,
      agent: {
        whenToUse:
          'Use when the user asks about their assigned tasks, open work items, or upcoming tasks.',
        whenNotToUse:
          'Do not use to create, update, or delete tasks. Do not use to list tasks that belong to other users.',
        examples: [
          {
            input: 'What tasks do I have open?',
            callArgs: { actorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', includeCompleted: false },
          },
        ],
      },
    })
    .input(z.object({ actorId: z.string().uuid() }))
    .query(async ({ input }) => {
      return svc().query(new ListTasksForActorQuery(input.actorId))
    }),
})
`

const EVIDENCE_ROUTER_SOURCE = `
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'

export const evidenceRouter = router({
  list: publicProcedure
    .meta({
      permission: PERMISSIONS.PLANNER_AGENT_LIST_EVIDENCE,
      agent: {
        whenToUse:
          'Use when the user asks to see evidence (attachments, links, notes) attached to a specific task.',
        whenNotToUse:
          'Do not use to upload, create, or remove evidence. Do not use to list tasks or plans.',
        examples: [
          {
            input: 'Show me the evidence on task X',
            callArgs: { tenantId: 'b1eebc99', taskId: 'd3eebc99' },
          },
        ],
      },
    })
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ input }) => {
      return svc().query(new ListTaskEvidenceQuery(input.taskId))
    }),
})
`

// ---------------------------------------------------------------------------
// parseOverrideComments
// ---------------------------------------------------------------------------

describe('parseOverrideComments', () => {
  it('parses a valid override comment with em-dash', () => {
    const source = `
// some code
// lint-override: R-15.1 — This procedure is a legacy alias kept for backward compat
const x = 1
`
    const result = parseOverrideComments(source)
    expect(result).toHaveLength(1)
    expect(result[0].ruleId).toBe('R-15.1')
    expect(result[0].justification).toBe(
      'This procedure is a legacy alias kept for backward compat',
    )
    expect(result[0].line).toBeGreaterThan(0)
  })

  it('parses a valid override comment with regular dash', () => {
    const source = `// lint-override: R-15.2 - Short description is intentional here for this case`
    const result = parseOverrideComments(source)
    expect(result).toHaveLength(1)
    expect(result[0].ruleId).toBe('R-15.2')
    expect(result[0].justification).toBe('Short description is intentional here for this case')
  })

  it('returns empty array when no override comments exist', () => {
    const source = `
// regular comment
const x = 1
// another comment
`
    const result = parseOverrideComments(source)
    expect(result).toHaveLength(0)
  })

  it('ignores malformed override comments missing the separator', () => {
    const source = `// lint-override: R-15.1 missing separator here`
    const result = parseOverrideComments(source)
    expect(result).toHaveLength(0)
  })

  it('ignores malformed override comments with no rule id', () => {
    const source = `// lint-override: — some justification`
    const result = parseOverrideComments(source)
    expect(result).toHaveLength(0)
  })

  it('parses multiple override comments', () => {
    const source = `
// lint-override: R-15.1 — First justification for this override
// lint-override: R-15.5 — Second justification is also here for completeness
const x = 1
`
    const result = parseOverrideComments(source)
    expect(result).toHaveLength(2)
    expect(result[0].ruleId).toBe('R-15.1')
    expect(result[1].ruleId).toBe('R-15.5')
  })

  it('captures correct line numbers', () => {
    const source = `const a = 1
const b = 2
// lint-override: R-15.3 — justification text here for the line number test
const c = 3`
    const result = parseOverrideComments(source)
    expect(result[0].line).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// detectProcedureType
// ---------------------------------------------------------------------------

describe('detectProcedureType', () => {
  it('detects query after .meta() block', () => {
    const source = `
  listTasks: publicProcedure
    .meta({ agent: { whenToUse: 'Use when...' } })
    .input(z.object({}))
    .query(async ({ input }) => { return [] })
`
    // metaLine is the line of .meta(
    const metaLine = 3
    expect(detectProcedureType(source, metaLine)).toBe('query')
  })

  it('detects mutation after .meta() block', () => {
    const source = `
  createTask: publicProcedure
    .meta({ agent: { whenToUse: 'Use when...' } })
    .input(z.object({}))
    .mutation(async ({ input }) => { return {} })
`
    const metaLine = 3
    expect(detectProcedureType(source, metaLine)).toBe('mutation')
  })

  it('returns unknown when neither query nor mutation follows', () => {
    const source = `
  createTask: publicProcedure
    .meta({ agent: { whenToUse: 'Use when...' } })
    .input(z.object({}))
    .subscribe(async ({ input }) => { return {} })
`
    const metaLine = 3
    expect(detectProcedureType(source, metaLine)).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// parseToolMetas
// ---------------------------------------------------------------------------

describe('parseToolMetas', () => {
  it('extracts two tool-meta blocks from personal.router.ts fixture', () => {
    const result = parseToolMetas('/fixtures/personal.router.ts', PERSONAL_ROUTER_SOURCE)
    expect(result).toHaveLength(2)
  })

  it('extracts whenToUse for listPlans procedure', () => {
    const result = parseToolMetas('/fixtures/personal.router.ts', PERSONAL_ROUTER_SOURCE)
    const listPlans = result.find((m) => m.procedureName === 'listPlans')
    expect(listPlans).toBeDefined()
    expect(listPlans!.whenToUse).toContain('the plans')
    expect(listPlans!.whenNotToUse).toContain('create')
  })

  it('extracts examples array for listPlans', () => {
    const result = parseToolMetas('/fixtures/personal.router.ts', PERSONAL_ROUTER_SOURCE)
    const listPlans = result.find((m) => m.procedureName === 'listPlans')
    expect(listPlans!.examples.length).toBeGreaterThanOrEqual(1)
    expect(listPlans!.examples[0].input).toBeTruthy()
  })

  it('detects query procedure type', () => {
    const result = parseToolMetas('/fixtures/personal.router.ts', PERSONAL_ROUTER_SOURCE)
    for (const meta of result) {
      expect(meta.procedureType).toBe('query')
    }
  })

  it('extracts one tool-meta from evidence.router.ts fixture', () => {
    const result = parseToolMetas('/fixtures/evidence.router.ts', EVIDENCE_ROUTER_SOURCE)
    expect(result).toHaveLength(1)
    expect(result[0].procedureName).toBe('list')
    expect(result[0].procedureType).toBe('query')
  })

  it('returns empty array when no .meta({agent:}) blocks present', () => {
    const source = `
export const simpleRouter = router({
  noop: publicProcedure.query(() => null),
})
`
    const result = parseToolMetas('/fixtures/simple.ts', source)
    expect(result).toHaveLength(0)
  })

  it('includes filePath on each result', () => {
    const result = parseToolMetas('/abs/path/personal.router.ts', PERSONAL_ROUTER_SOURCE)
    for (const meta of result) {
      expect(meta.filePath).toBe('/abs/path/personal.router.ts')
    }
  })
})

// ---------------------------------------------------------------------------
// parseSubAgents
// ---------------------------------------------------------------------------

describe('parseSubAgents', () => {
  it('extracts sub-agent from planner-read-only.ts fixture', () => {
    const result = parseSubAgents('/fixtures/planner-read-only.ts', PLANNER_READ_ONLY_SOURCE)
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('planner.read-only')
  })

  it('extracts description', () => {
    const result = parseSubAgents('/fixtures/planner-read-only.ts', PLANNER_READ_ONLY_SOURCE)
    expect(result[0].description).toContain('Surfaces tasks')
  })

  it('extracts whenToUse', () => {
    const result = parseSubAgents('/fixtures/planner-read-only.ts', PLANNER_READ_ONLY_SOURCE)
    expect(result[0].whenToUse).toContain('tasks, plans, upcoming work')
  })

  it('extracts promptTemplate variable names', () => {
    const result = parseSubAgents('/fixtures/planner-read-only.ts', PLANNER_READ_ONLY_SOURCE)
    expect(result[0].promptTemplateVariables).toContain('userDisplayName')
  })

  it('returns empty array when no defineSubAgent call present', () => {
    const result = parseSubAgents('/fixtures/other.ts', LIST_MY_PLANS_SOURCE)
    expect(result).toHaveLength(0)
  })

  it('includes filePath on each result', () => {
    const result = parseSubAgents('/abs/path/planner-read-only.ts', PLANNER_READ_ONLY_SOURCE)
    expect(result[0].filePath).toBe('/abs/path/planner-read-only.ts')
  })
})

// ---------------------------------------------------------------------------
// parseIntents
// ---------------------------------------------------------------------------

describe('parseIntents', () => {
  it('extracts intent from list-my-plans.ts fixture', () => {
    const result = parseIntents('/fixtures/list-my-plans.ts', LIST_MY_PLANS_SOURCE)
    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('planner.list-my-plans')
    expect(result[0].domain).toBe('planner')
  })

  it('extracts intent from list-my-tasks.ts fixture', () => {
    const result = parseIntents('/fixtures/list-my-tasks.ts', LIST_MY_TASKS_SOURCE)
    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('planner.list-my-tasks')
    expect(result[0].domain).toBe('planner')
  })

  it('extracts intent from list-evidence.ts fixture', () => {
    const result = parseIntents('/fixtures/list-evidence.ts', LIST_EVIDENCE_SOURCE)
    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('planner.list-evidence')
  })

  it('returns empty array when no IntentDescriptor present', () => {
    const result = parseIntents('/fixtures/other.ts', PLANNER_READ_ONLY_SOURCE)
    expect(result).toHaveLength(0)
  })

  it('includes filePath on each result', () => {
    const result = parseIntents('/abs/path/list-my-plans.ts', LIST_MY_PLANS_SOURCE)
    expect(result[0].filePath).toBe('/abs/path/list-my-plans.ts')
  })

  it('records line number > 0', () => {
    const result = parseIntents('/fixtures/list-my-plans.ts', LIST_MY_PLANS_SOURCE)
    expect(result[0].line).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// parseFlowPolicies
// ---------------------------------------------------------------------------

describe('parseFlowPolicies', () => {
  const FLOW_POLICY_SOURCE = `
import type { FlowPolicyEntry } from '../../../agents/declare'

export const listMyPlansFlowPolicy: FlowPolicyEntry = {
  intent_slug: 'planner.list-my-plans',
  steps: [],
}

export const listMyTasksFlowPolicy: FlowPolicyEntry = {
  intent_slug: 'planner.list-my-tasks',
  steps: [],
}
`

  it('extracts both flow policies', () => {
    const result = parseFlowPolicies('/fixtures/flow-policies.ts', FLOW_POLICY_SOURCE)
    expect(result).toHaveLength(2)
  })

  it('extracts intent_slug values', () => {
    const result = parseFlowPolicies('/fixtures/flow-policies.ts', FLOW_POLICY_SOURCE)
    const slugs = result.map((p) => p.intentSlug)
    expect(slugs).toContain('planner.list-my-plans')
    expect(slugs).toContain('planner.list-my-tasks')
  })

  it('returns empty array when no intent_slug fields present', () => {
    const result = parseFlowPolicies('/fixtures/other.ts', LIST_MY_PLANS_SOURCE)
    expect(result).toHaveLength(0)
  })

  it('includes filePath on each result', () => {
    const result = parseFlowPolicies('/abs/path/flow.ts', FLOW_POLICY_SOURCE)
    for (const fp of result) {
      expect(fp.filePath).toBe('/abs/path/flow.ts')
    }
  })

  it('records line number > 0', () => {
    const result = parseFlowPolicies('/fixtures/flow-policies.ts', FLOW_POLICY_SOURCE)
    expect(result[0].line).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// extractBalanced — braces inside string literals (Issue 3)
// ---------------------------------------------------------------------------

describe('parseToolMetas — braces inside string literals', () => {
  it('does not miscount braces inside single-quoted whenToUse values', () => {
    const source = `
export const r = router({
  doThing: publicProcedure
    .meta({
      agent: {
        whenToUse: 'Use when { tenant } needs help with tasks.',
        whenNotToUse: 'Do not use for { admin } operations.',
        examples: [
          { input: 'Help me', callArgs: { id: '1' } },
        ],
      },
    })
    .query(async () => null),
})
`
    const result = parseToolMetas('/fixtures/r.ts', source)
    expect(result).toHaveLength(1)
    expect(result[0].whenToUse).toContain('{ tenant }')
    expect(result[0].whenNotToUse).toContain('{ admin }')
    expect(result[0].examples).toHaveLength(1)
    expect(result[0].examples[0].input).toBe('Help me')
  })

  it('handles nested callArgs with brace-containing strings', () => {
    const source = `
export const r = router({
  doThing: publicProcedure
    .meta({
      agent: {
        whenToUse: 'Use for { any } request.',
        whenNotToUse: 'Avoid.',
        examples: [
          { input: 'First { example }', callArgs: { id: 'abc' } },
          { input: 'Second', callArgs: { id: 'def' } },
        ],
      },
    })
    .query(async () => null),
})
`
    const result = parseToolMetas('/fixtures/r.ts', source)
    expect(result).toHaveLength(1)
    expect(result[0].examples).toHaveLength(2)
    expect(result[0].examples[0].input).toBe('First { example }')
    expect(result[0].examples[1].input).toBe('Second')
  })
})

// ---------------------------------------------------------------------------
// extractStringField — escaped quotes in field values (Issue 2)
// ---------------------------------------------------------------------------

describe('parseToolMetas — escaped quotes in field values', () => {
  it('handles escaped single quote inside single-quoted string', () => {
    const source = `
export const r = router({
  doThing: publicProcedure
    .meta({
      agent: {
        whenToUse: 'Use when user says \\'don\\'t forget\\'.',
        whenNotToUse: 'Never.',
        examples: [
          { input: 'Go', callArgs: { id: '1' } },
        ],
      },
    })
    .query(async () => null),
})
`
    const result = parseToolMetas('/fixtures/r.ts', source)
    expect(result).toHaveLength(1)
    expect(result[0].whenToUse).toContain("don\\'t forget")
  })

  it('handles escaped double quote inside double-quoted string', () => {
    const source = `
export const r = router({
  doThing: publicProcedure
    .meta({
      agent: {
        whenToUse: "Use when user asks \\"what\\".",
        whenNotToUse: "Never.",
        examples: [
          { input: "Go", callArgs: { id: "1" } },
        ],
      },
    })
    .query(async () => null),
})
`
    const result = parseToolMetas('/fixtures/r.ts', source)
    expect(result).toHaveLength(1)
    expect(result[0].whenToUse).toContain('\\"what\\"')
  })
})

// ---------------------------------------------------------------------------
// Negative / isNegative example detection
// ---------------------------------------------------------------------------

describe('parseToolMetas — isNegative detection', () => {
  it('marks example as negative when input contains "not"', () => {
    const source = `
export const r = router({
  doThing: publicProcedure
    .meta({
      agent: {
        whenToUse: 'Use when the user wants to perform this specific action in the system.',
        whenNotToUse: 'Do not use for deletions.',
        examples: [
          { input: 'Do not do this task', callArgs: { id: '123' } },
          { input: 'Do the thing normally', callArgs: { id: '456' } },
        ],
      },
    })
    .query(async () => null),
})
`
    const result = parseToolMetas('/fixtures/r.ts', source)
    expect(result).toHaveLength(1)
    const negExample = result[0].examples.find((e) => e.input.includes('Do not'))
    expect(negExample?.isNegative).toBe(true)
    const posExample = result[0].examples.find((e) => e.input.includes('normally'))
    expect(posExample?.isNegative).toBeFalsy()
  })

  it('marks example as negative when callArgs is empty {}', () => {
    const source = `
export const r = router({
  doThing: publicProcedure
    .meta({
      agent: {
        whenToUse: 'Use when the user wants to perform this specific action in the system.',
        whenNotToUse: 'Do not use for deletions.',
        examples: [
          { input: 'Attempt with no args', callArgs: {} },
        ],
      },
    })
    .mutation(async () => null),
})
`
    const result = parseToolMetas('/fixtures/r.ts', source)
    expect(result[0].examples[0].isNegative).toBe(true)
  })
})
