import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createWorkflow } from './create-workflow'
import { defineStep } from './define-step'
import { WorkflowBuildError } from './errors'
import { workflowRegistry } from './registry'
import { __resetQueueRegistryForTests } from './runner/queue'

const noop = defineStep({
  id: 'noop',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  async execute() {
    return {}
  },
})

const wfA = createWorkflow({
  id: 'wf-a',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
})
  .then(noop)
  .commit()

const wfB = createWorkflow({
  id: 'wf-b',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
})
  .then(noop)
  .commit()

describe('workflowRegistry', () => {
  beforeEach(() => {
    workflowRegistry.__resetForTests()
    __resetQueueRegistryForTests()
  })

  it('registers and retrieves by id', () => {
    workflowRegistry.register(wfA)
    expect(workflowRegistry.get('wf-a')?.id).toBe('wf-a')
  })

  it('throws on duplicate id', () => {
    workflowRegistry.register(wfA)
    expect(() => workflowRegistry.register(wfA)).toThrow(WorkflowBuildError)
  })

  it('list() returns registered ids', () => {
    workflowRegistry.register(wfA)
    workflowRegistry.register(wfB)
    expect(
      workflowRegistry
        .list()
        .map((w) => w.id)
        .sort(),
    ).toEqual(['wf-a', 'wf-b'])
  })

  it('configure() rejects non-positive concurrency', () => {
    expect(() => workflowRegistry.configure({ perTenantConcurrency: 0 })).toThrow()
  })

  it('configure() accepts a positive integer', () => {
    expect(() => workflowRegistry.configure({ perTenantConcurrency: 8 })).not.toThrow()
  })
})
