import { describe, expect, it } from 'vitest'
import {
  AgentError,
  KernelError,
  kernelErrorOf,
  LlmError,
  ToolError,
  ToolValidationError,
} from './index'

describe('KernelError', () => {
  it('carries code, domain, category, details', () => {
    const e = new KernelError({
      code: 'TEST_CODE',
      domain: 'KERNEL',
      category: 'SYSTEM',
      message: 'test',
      details: { foo: 1 },
    })
    expect(e.code).toBe('TEST_CODE')
    expect(e.domain).toBe('KERNEL')
    expect(e.category).toBe('SYSTEM')
    expect(e.details).toEqual({ foo: 1 })
    expect(e.message).toBe('test')
  })

  it('toJSON returns structured payload', () => {
    const e = new KernelError({
      code: 'X',
      domain: 'LLM',
      category: 'THIRD_PARTY',
      message: 'fail',
    })
    const json = e.toJSON()
    expect(json).toMatchObject({
      id: expect.any(String),
      code: 'X',
      domain: 'LLM',
      category: 'THIRD_PARTY',
      message: 'fail',
    })
  })

  it('default status is 500', () => {
    const e = new KernelError({
      code: 'X',
      domain: 'KERNEL',
      category: 'SYSTEM',
      message: 'fail',
    })
    expect(e.problem.status).toBe(500)
  })

  it('accepts explicit status override', () => {
    const e = new KernelError({
      code: 'X',
      domain: 'AGENT',
      category: 'USER',
      message: 'bad input',
      status: 400,
    })
    expect(e.problem.status).toBe(400)
  })

  it('preserves cause', () => {
    const inner = new Error('inner')
    const e = new KernelError({
      code: 'X',
      domain: 'KERNEL',
      category: 'SYSTEM',
      message: 'wrap',
      cause: inner,
    })
    expect(e.cause).toBe(inner)
  })
})

describe('subclass domain presets', () => {
  it('AgentError sets AGENT domain', () => {
    const e = new AgentError({ code: 'X', category: 'USER', message: 'm' })
    expect(e.domain).toBe('AGENT')
  })
  it('LlmError sets LLM domain', () => {
    const e = new LlmError({ code: 'X', category: 'THIRD_PARTY', message: 'm' })
    expect(e.domain).toBe('LLM')
  })
  it('ToolError sets TOOL domain', () => {
    const e = new ToolError({ code: 'X', category: 'SYSTEM', message: 'm' })
    expect(e.domain).toBe('TOOL')
  })
  it('ToolValidationError extends ToolError', () => {
    const e = new ToolValidationError({ code: 'X', category: 'USER', message: 'm' })
    expect(e).toBeInstanceOf(ToolError)
    expect(e.domain).toBe('TOOL')
  })
})

describe('kernelErrorOf', () => {
  it('passes through existing KernelError', () => {
    const e = new LlmError({ code: 'Y', category: 'THIRD_PARTY', message: 'rate limited' })
    expect(kernelErrorOf(e)).toBe(e)
  })
  it('wraps a plain Error', () => {
    const k = kernelErrorOf(new Error('boom'))
    expect(k).toBeInstanceOf(KernelError)
    expect(k.code).toBe('UNKNOWN_KERNEL_ERROR')
    expect(k.domain).toBe('KERNEL')
    expect(k.category).toBe('SYSTEM')
    expect(k.cause).toBeInstanceOf(Error)
  })
  it('wraps a non-Error string value', () => {
    const k = kernelErrorOf('something bad')
    expect(k).toBeInstanceOf(KernelError)
    expect(k.message).toContain('something bad')
  })
  it('wraps null and undefined', () => {
    expect(kernelErrorOf(null)).toBeInstanceOf(KernelError)
    expect(kernelErrorOf(undefined)).toBeInstanceOf(KernelError)
  })
})
