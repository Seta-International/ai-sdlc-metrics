/**
 * pipeline-errors.spec.ts — Plan 18 §1 Task 1.
 *
 * Six cases cover the three typed pipeline errors and the
 * `classifyPipelineError` mapping to SSE close-error causes.
 */

import { describe, it, expect } from 'vitest'
import {
  RouterLlmFailureError,
  RouterParseEscalationError,
  SynthesizerStreamFailureError,
  classifyPipelineError,
} from './pipeline-errors'

describe('classifyPipelineError', () => {
  it('1. RouterLlmFailureError → router_failure', () => {
    expect(classifyPipelineError(new RouterLlmFailureError('llm_timeout'))).toBe('router_failure')
  })

  it('2. RouterParseEscalationError → router_failure', () => {
    expect(classifyPipelineError(new RouterParseEscalationError('parse failed'))).toBe(
      'router_failure',
    )
  })

  it('3. SynthesizerStreamFailureError → synthesizer_failure', () => {
    const err = new SynthesizerStreamFailureError('pre_shape_failure', new Error('boom'))
    expect(classifyPipelineError(err)).toBe('synthesizer_failure')
  })

  it.each([
    ['plain Error', new Error('whatever')],
    ['string throw', 'oops' as unknown],
    ['undefined', undefined as unknown],
    ['null', null as unknown],
  ])('4. untyped error (%s) → internal_error', (_label, value) => {
    expect(classifyPipelineError(value)).toBe('internal_error')
  })

  it('5. RouterLlmFailureError preserves failureCause and name', () => {
    const underlying = new Error('upstream blew up')
    const err = new RouterLlmFailureError('llm_timeout', underlying)
    expect(err.failureCause).toBe('llm_timeout')
    expect(err.name).toBe('RouterLlmFailureError')
    expect(err.cause).toBe(underlying)
  })

  it('6. SynthesizerStreamFailureError preserves failureCause, name, and Error.cause', () => {
    const underlying = new Error('mid-stream blow up')
    const err = new SynthesizerStreamFailureError('pre_shape_failure', underlying)
    expect(err.failureCause).toBe('pre_shape_failure')
    expect(err.name).toBe('SynthesizerStreamFailureError')
    expect(err.cause).toBe(underlying)
  })
})
