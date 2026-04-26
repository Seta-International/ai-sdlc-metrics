// synthetic module — used by EI-10 lint runner acceptance test
import { defineSubAgent } from '../../../agents/declare'
import * as z from 'zod'

export const syntheticWorkerSubAgent = defineSubAgent({
  key: 'synthetic.worker',
  domain: 'synthetic',
  description:
    'A synthetic sub-agent for testing that the lint runner discovers new modules automatically without central registration.',
  whenToUse:
    'Use when testing the EI-10 lint runner discovery mechanism. This agent is intentionally minimal.',
  promptTemplate: {
    body: 'You are a synthetic worker agent.',
    variables: z.object({ testVar: z.string() }),
  },
  inputSchema: z.object({ utterance: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  toolScope: [],
  budgets: { maxIterations: 4, wallclockMs: 5_000, costUsd: 0.01 },
  memoryScope: { reads: ['L1'], writes: ['L1'] },
  model: () => ({ provider: 'openai', model: 'gpt-5.4-nano' }),
  source: 'code',
})
