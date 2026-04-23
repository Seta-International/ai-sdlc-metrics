import { describe, expect, it } from 'vitest'
import { PreCaptureRedactor, REDACTED_MARKER } from './pre-capture-redactor'

describe('PreCaptureRedactor', () => {
  const redactor = new PreCaptureRedactor()

  it('returns attrs unchanged when freeTextKeys is empty', () => {
    const attrs = { tool_name: 'planner.list', args: { filter: 'active' } }
    const result = redactor.redact(attrs, new Set())
    expect(result).toEqual(attrs)
    expect(result).not.toBe(attrs)
  })

  it('replaces declared free-text keys with the redaction marker', () => {
    const attrs = {
      tool_name: 'goals.update',
      user_message: 'Please update my goal to ...',
      note: 'Some user comment',
      cost_usd: 0.01,
    }
    const result = redactor.redact(attrs, new Set(['user_message', 'note']))
    expect(result['user_message']).toBe(REDACTED_MARKER)
    expect(result['note']).toBe(REDACTED_MARKER)
  })

  it('leaves non-declared keys untouched', () => {
    const attrs = {
      tool_name: 'hiring.list_jobs',
      user_message: 'find senior devs',
      result_hash: 'sha256-abc123',
      phase: 1,
    }
    const result = redactor.redact(attrs, new Set(['user_message']))
    expect(result['tool_name']).toBe('hiring.list_jobs')
    expect(result['result_hash']).toBe('sha256-abc123')
    expect(result['phase']).toBe(1)
    expect(result['user_message']).toBe(REDACTED_MARKER)
  })

  it('returns a new object — does not mutate the input', () => {
    const attrs = { user_query: 'private info', safe_field: 'ok' }
    const result = redactor.redact(attrs, new Set(['user_query']))
    expect(attrs['user_query']).toBe('private info') // original unchanged
    expect(result).not.toBe(attrs)
  })

  it('handles attrs with no matching keys gracefully (all keys unaffected)', () => {
    const attrs = { span_type: 'TURN', trace_id: 'abc' }
    const result = redactor.redact(attrs, new Set(['user_message']))
    expect(result).toEqual(attrs)
  })
})
