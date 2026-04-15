import { describe, expect, it } from 'vitest'
import { InvalidEmploymentStatusTransitionException } from '../exceptions/people.exceptions'
import {
  assertValidTransition,
  canTransition,
  getValidTargetStates,
} from './employment-state-machine'

describe('canTransition', () => {
  it('returns true for pre_hire → active', () => {
    expect(canTransition('pre_hire', 'active')).toBe(true)
  })

  it('returns false for active → pre_hire (no backward transition)', () => {
    expect(canTransition('active', 'pre_hire')).toBe(false)
  })

  it('returns true for active → on_leave', () => {
    expect(canTransition('active', 'on_leave')).toBe(true)
  })

  it('returns false for terminated → active (terminal state)', () => {
    expect(canTransition('terminated', 'active')).toBe(false)
  })

  it('returns true for on_leave → active', () => {
    expect(canTransition('on_leave', 'active')).toBe(true)
  })

  it('returns true for suspended → active', () => {
    expect(canTransition('suspended', 'active')).toBe(true)
  })

  it('returns true for notice_period → terminated', () => {
    expect(canTransition('notice_period', 'terminated')).toBe(true)
  })

  it('returns false for notice_period → active', () => {
    expect(canTransition('notice_period', 'active')).toBe(false)
  })

  it('returns false for terminated → terminated (already terminal)', () => {
    expect(canTransition('terminated', 'terminated')).toBe(false)
  })
})

describe('getValidTargetStates', () => {
  it('returns correct targets for active', () => {
    expect(getValidTargetStates('active')).toEqual([
      'on_leave',
      'suspended',
      'notice_period',
      'terminated',
    ])
  })

  it('returns correct targets for pre_hire', () => {
    expect(getValidTargetStates('pre_hire')).toEqual(['active', 'terminated'])
  })

  it('returns correct targets for on_leave', () => {
    expect(getValidTargetStates('on_leave')).toEqual(['active', 'terminated'])
  })

  it('returns correct targets for suspended', () => {
    expect(getValidTargetStates('suspended')).toEqual(['active', 'terminated'])
  })

  it('returns correct targets for notice_period', () => {
    expect(getValidTargetStates('notice_period')).toEqual(['terminated'])
  })

  it('returns empty array for terminated (no valid targets)', () => {
    expect(getValidTargetStates('terminated')).toEqual([])
  })
})

describe('assertValidTransition', () => {
  it('does not throw for valid transition active → on_leave', () => {
    expect(() => assertValidTransition('active', 'on_leave')).not.toThrow()
  })

  it('throws InvalidEmploymentStatusTransitionException for active → pre_hire', () => {
    expect(() => assertValidTransition('active', 'pre_hire')).toThrow(
      InvalidEmploymentStatusTransitionException,
    )
  })

  it('throws for terminated → active', () => {
    expect(() => assertValidTransition('terminated', 'active')).toThrow(
      InvalidEmploymentStatusTransitionException,
    )
  })

  it('throws for suspended → notice_period', () => {
    expect(() => assertValidTransition('suspended', 'notice_period')).toThrow(
      InvalidEmploymentStatusTransitionException,
    )
  })
})
