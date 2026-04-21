/**
 * planner.read-only — canonical Phase 1 sub-agent (Plan 02 §13).
 *
 * Surfaces tasks, plans, and evidence owned by the caller or visible to them
 * by role. Strictly read-only — no mutations.
 *
 * toolScope tool names match tRPC procedure dot-paths as harvested by
 * ToolRegistry.loadFromRouter:
 *   planner.personal.listTasks  → planner > personal > listTasks
 *   planner.personal.listPlans  → planner > personal > listPlans
 *   planner.evidence.list       → planner > evidence > list
 */

import { z } from 'zod'
import { defineSubAgent } from '../../../agents/declare'

export const plannerReadOnlySubAgent = defineSubAgent({
  key: 'planner.read-only',
  domain: 'planner',
  description:
    'Surfaces tasks, plans, and evidence owned by the caller or visible to them by role.',
  whenToUse:
    'Use when the user asks about their own tasks, plans, upcoming work, or evidence they have contributed. Do not use for task creation or mutation.',
  promptTemplate: {
    body: 'You are a read-only planner assistant. You help users understand their current tasks, plans, and evidence. Always present information clearly and concisely. Never offer to create, update, or delete items.',
    variables: z.object({
      userDisplayName: z.string().min(1),
    }),
  },
  inputSchema: z.object({
    utterance: z.string().min(1),
    filters: z
      .object({
        status: z.enum(['open', 'done', 'all']).optional(),
        limit: z.number().int().positive().max(50).optional(),
      })
      .optional(),
  }),
  outputSchema: z.object({
    summary: z.string(),
    items: z.array(
      z.object({
        id: z.string().uuid(),
        kind: z.enum(['task', 'plan', 'evidence']),
        title: z.string(),
      }),
    ),
  }),
  // Tool names are tRPC procedure dot-paths registered via .meta({ agent: {...} }).
  // These must exist in ToolRegistry — validated at boot time by SubAgentRegistry.
  toolScope: ['planner.personal.listTasks', 'planner.personal.listPlans', 'planner.evidence.list'],
  budgets: {
    maxIterations: 4,
    wallclockMs: 15_000,
    costUsd: 0.02,
    toolCeilingBytes: 64_000,
  },
  memoryScope: {
    reads: ['L1', 'L2', 'L3'],
    writes: ['L1'],
  },
  model: (ctx) => ({
    provider: 'openai',
    model: ctx.surface === 'async' ? 'gpt-5.4-mini' : 'gpt-5.4-nano',
  }),
  source: 'code',
})
