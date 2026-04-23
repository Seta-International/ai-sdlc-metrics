import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BLOCKED_LABELS,
  MetricCardinalityError,
  MetricLabelGuard,
} from './metric-label-guard'

describe('DEFAULT_BLOCKED_LABELS', () => {
  it('contains exactly the 5 spec-required labels', () => {
    expect(DEFAULT_BLOCKED_LABELS).toHaveLength(5)
    expect(DEFAULT_BLOCKED_LABELS).toContain('user_id')
    expect(DEFAULT_BLOCKED_LABELS).toContain('conversation_id')
    expect(DEFAULT_BLOCKED_LABELS).toContain('trace_id')
    expect(DEFAULT_BLOCKED_LABELS).toContain('delegation_id')
    expect(DEFAULT_BLOCKED_LABELS).toContain('schedule_id')
  })
})

describe('MetricLabelGuard.sanitize', () => {
  it('removes blocked labels from output', () => {
    const labels = { user_id: 'u-123', model: 'gpt-4', trace_id: 't-abc' }
    const result = MetricLabelGuard.sanitize(labels)
    expect(result).not.toHaveProperty('user_id')
    expect(result).not.toHaveProperty('trace_id')
  })

  it('keeps non-blocked labels unchanged', () => {
    const labels = { model: 'gpt-4', tool: 'search', user_id: 'u-123' }
    const result = MetricLabelGuard.sanitize(labels)
    expect(result).toEqual({ model: 'gpt-4', tool: 'search' })
  })

  it('works with empty input', () => {
    const result = MetricLabelGuard.sanitize({})
    expect(result).toEqual({})
  })

  it('uses custom blocked list when provided', () => {
    const labels = { foo: 'bar', baz: 'qux', model: 'gpt-4' }
    const result = MetricLabelGuard.sanitize(labels, ['foo', 'baz'])
    expect(result).toEqual({ model: 'gpt-4' })
    expect(result).not.toHaveProperty('foo')
    expect(result).not.toHaveProperty('baz')
  })
})

describe('MetricLabelGuard.hasBlockedLabel', () => {
  it('returns true when a blocked label is present', () => {
    const labels = { model: 'gpt-4', conversation_id: 'c-999' }
    expect(MetricLabelGuard.hasBlockedLabel(labels)).toBe(true)
  })

  it('returns false when no blocked labels are present', () => {
    const labels = { model: 'gpt-4', tool: 'search' }
    expect(MetricLabelGuard.hasBlockedLabel(labels)).toBe(false)
  })
})

describe('MetricLabelGuard.assertNoBlockedLabels', () => {
  it('throws MetricCardinalityError listing offending labels', () => {
    const labels = { delegation_id: 'd-1', schedule_id: 's-2', model: 'gpt-4' }
    expect(() => MetricLabelGuard.assertNoBlockedLabels(labels)).toThrow(MetricCardinalityError)
    expect(() => MetricLabelGuard.assertNoBlockedLabels(labels)).toThrow(/delegation_id/)
    expect(() => MetricLabelGuard.assertNoBlockedLabels(labels)).toThrow(/schedule_id/)
  })

  it('does NOT throw for safe labels', () => {
    const labels = { model: 'gpt-4', status: 'ok' }
    expect(() => MetricLabelGuard.assertNoBlockedLabels(labels)).not.toThrow()
  })
})
