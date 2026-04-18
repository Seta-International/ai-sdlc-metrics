import { describe, expect, it } from 'vitest'
import { DomainException } from '@future/core'
import { Priority } from './priority.vo'

describe('Priority', () => {
  describe('valid values', () => {
    it('accepts 1 (urgent)', () => {
      const p = Priority.of(1)
      expect(p.value).toBe(1)
    })

    it('accepts 3 (important)', () => {
      const p = Priority.of(3)
      expect(p.value).toBe(3)
    })

    it('accepts 5 (medium)', () => {
      const p = Priority.of(5)
      expect(p.value).toBe(5)
    })

    it('accepts 9 (low)', () => {
      const p = Priority.of(9)
      expect(p.value).toBe(9)
    })
  })

  describe('invalid values', () => {
    it('throws DomainException for 0', () => {
      expect(() => Priority.of(0)).toThrow(DomainException)
    })

    it('throws DomainException for 2', () => {
      expect(() => Priority.of(2)).toThrow(DomainException)
    })

    it('throws DomainException for 4', () => {
      expect(() => Priority.of(4)).toThrow(DomainException)
    })

    it('throws DomainException for 10', () => {
      expect(() => Priority.of(10)).toThrow(DomainException)
    })

    it('throws DomainException for -1', () => {
      expect(() => Priority.of(-1)).toThrow(DomainException)
    })

    it('throws DomainException for NaN', () => {
      expect(() => Priority.of(NaN)).toThrow(DomainException)
    })

    it('exception has code INVALID_PRIORITY', () => {
      let caught: DomainException | undefined
      try {
        Priority.of(7)
      } catch (e) {
        caught = e as DomainException
      }
      expect(caught).toBeDefined()
      expect(caught?.code).toBe('INVALID_PRIORITY')
    })
  })
})
