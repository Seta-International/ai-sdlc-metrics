import { DomainError } from '@seta/middleware'
import { describe, expect, it } from 'vitest'
import {
  StepExecutionError,
  StepInputValidationError,
  StepOutputValidationError,
  WorkflowBailed,
  WorkflowBuildError,
  WorkflowError,
} from './errors'

describe('WorkflowError hierarchy', () => {
  it('WorkflowError extends DomainError', () => {
    const e = new WorkflowError(500, 'boom')
    expect(e).toBeInstanceOf(DomainError)
    expect(e).toBeInstanceOf(WorkflowError)
    expect(e.message).toBe('boom')
  })

  it('WorkflowBuildError extends WorkflowError', () => {
    const e = new WorkflowBuildError('duplicate step id')
    expect(e).toBeInstanceOf(WorkflowError)
    expect(e.message).toBe('duplicate step id')
  })

  it('StepInputValidationError carries runId + stepId in detail', () => {
    const e = new StepInputValidationError({
      runId: 'r1',
      stepId: 's1',
      cause: new Error('bad'),
    })
    expect(e).toBeInstanceOf(WorkflowError)
    expect(e.detail).toMatchObject({ runId: 'r1', stepId: 's1' })
  })

  it('StepOutputValidationError carries runId + stepId in detail', () => {
    const e = new StepOutputValidationError({
      runId: 'r1',
      stepId: 's1',
      cause: new Error('bad'),
    })
    expect(e.detail).toMatchObject({ runId: 'r1', stepId: 's1' })
  })

  it('StepExecutionError carries cause + runId + stepId', () => {
    const cause = new Error('underlying')
    const e = new StepExecutionError({ runId: 'r1', stepId: 's1', cause })
    expect(e.cause).toBe(cause)
    expect(e.detail).toMatchObject({ runId: 'r1', stepId: 's1' })
  })

  it('WorkflowBailed extends WorkflowError', () => {
    const e = new WorkflowBailed('done early')
    expect(e).toBeInstanceOf(WorkflowError)
    expect(e.message).toBe('done early')
  })
})
