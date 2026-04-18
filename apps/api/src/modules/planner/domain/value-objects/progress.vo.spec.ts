import { describe, expect, it } from 'vitest'
import { DomainException } from '@future/core'
import { Progress } from './progress.vo'

describe('Progress', () => {
  describe('valid values', () => {
    it('accepts 0', () => {
      const p = Progress.of(0)
      expect(p.value).toBe(0)
    })

    it('accepts 50', () => {
      const p = Progress.of(50)
      expect(p.value).toBe(50)
    })

    it('accepts 100', () => {
      const p = Progress.of(100)
      expect(p.value).toBe(100)
    })
  })

  describe('invalid values', () => {
    it('throws DomainException for 1', () => {
      expect(() => Progress.of(1)).toThrow(DomainException)
    })

    it('throws DomainException for 25', () => {
      expect(() => Progress.of(25)).toThrow(DomainException)
    })

    it('throws DomainException for 75', () => {
      expect(() => Progress.of(75)).toThrow(DomainException)
    })

    it('throws DomainException for -1', () => {
      expect(() => Progress.of(-1)).toThrow(DomainException)
    })

    it('throws DomainException for 101', () => {
      expect(() => Progress.of(101)).toThrow(DomainException)
    })

    it('throws DomainException for NaN', () => {
      expect(() => Progress.of(NaN)).toThrow(DomainException)
    })

    it('exception has code INVALID_PROGRESS', () => {
      let caught: DomainException | undefined
      try {
        Progress.of(42)
      } catch (e) {
        caught = e as DomainException
      }
      expect(caught).toBeDefined()
      expect(caught?.code).toBe('INVALID_PROGRESS')
    })
  })
})
