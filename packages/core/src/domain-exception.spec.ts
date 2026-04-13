import { describe, it, expect } from 'vitest'
import { DomainException } from './domain-exception'

class TestException extends DomainException {
  readonly code = 'TEST_ERROR'
  constructor(msg: string) {
    super(msg)
  }
}

describe('DomainException', () => {
  it('sets message and code', () => {
    const err = new TestException('something went wrong')
    expect(err.message).toBe('something went wrong')
    expect(err.code).toBe('TEST_ERROR')
  })

  it('sets name to the subclass name', () => {
    const err = new TestException('fail')
    expect(err.name).toBe('TestException')
  })

  it('is an instance of Error', () => {
    const err = new TestException('fail')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(DomainException)
  })
})
