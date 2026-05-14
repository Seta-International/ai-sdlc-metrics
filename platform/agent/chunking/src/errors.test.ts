import { KernelError } from '@seta/agent-core'
import { describe, expect, test } from 'vitest'
import { ChunkingError } from './errors'

describe('ChunkingError', () => {
  test('extends KernelError', () => {
    const e = new ChunkingError({ message: 'boom' })
    expect(e).toBeInstanceOf(KernelError)
    expect(e).toBeInstanceOf(Error)
  })

  test('defaults code to CHUNKING_FAILED, domain to KERNEL, category to SYSTEM', () => {
    const e = new ChunkingError({ message: 'boom' })
    expect(e.code).toBe('CHUNKING_FAILED')
    expect(e.domain).toBe('KERNEL')
    expect(e.category).toBe('SYSTEM')
    expect(e.message).toBe('boom')
  })

  test('accepts custom code and USER category', () => {
    const e = new ChunkingError({
      message: 'bad opts',
      code: 'INVALID_OPTIONS',
      category: 'USER',
    })
    expect(e.code).toBe('INVALID_OPTIONS')
    expect(e.category).toBe('USER')
  })

  test('preserves cause and details', () => {
    const cause = new Error('inner')
    const e = new ChunkingError({
      message: 'outer',
      cause,
      details: { hint: 'try a smaller maxTokens' },
    })
    expect(e.cause).toBe(cause)
    expect(e.details).toEqual({ hint: 'try a smaller maxTokens' })
  })
})
