import { AgentError } from '@seta/agent-core'
import { DomainError } from '@seta/middleware'
import { describe, expect, test } from 'vitest'
import { VectorInsertFailedError, VectorQueryFailedError } from './errors'

describe('VectorQueryFailedError', () => {
  test('is an AgentError (and transitively a DomainError)', () => {
    const err = new VectorQueryFailedError(new Error('boom'))
    expect(err).toBeInstanceOf(AgentError)
    expect(err).toBeInstanceOf(DomainError)
  })

  test('carries the documented code, category, message, and cause', () => {
    const cause = new Error('boom')
    const err = new VectorQueryFailedError(cause)
    expect(err.code).toBe('VECTOR_QUERY_FAILED')
    expect(err.category).toBe('SYSTEM')
    expect(err.message).toBe('Failed to query vector store')
    expect(err.cause).toBe(cause)
  })
})

describe('VectorInsertFailedError', () => {
  test('is an AgentError (and transitively a DomainError)', () => {
    const err = new VectorInsertFailedError(new Error('boom'))
    expect(err).toBeInstanceOf(AgentError)
    expect(err).toBeInstanceOf(DomainError)
  })

  test('carries the documented code, category, message, and cause', () => {
    const cause = new Error('boom')
    const err = new VectorInsertFailedError(cause)
    expect(err.code).toBe('VECTOR_INSERT_FAILED')
    expect(err.category).toBe('SYSTEM')
    expect(err.message).toBe('Failed to insert chunks')
    expect(err.cause).toBe(cause)
  })
})
