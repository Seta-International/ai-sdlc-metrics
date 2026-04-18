import { describe, expect, it } from 'vitest'
import { DomainException } from '@future/core'
import { LabelSlot } from './label-slot.vo'

describe('LabelSlot', () => {
  describe('valid values', () => {
    it('accepts "category1"', () => {
      const ls = LabelSlot.of('category1')
      expect(ls.value).toBe('category1')
    })

    it('accepts "category25"', () => {
      const ls = LabelSlot.of('category25')
      expect(ls.value).toBe('category25')
    })

    it('accepts "category13" (middle value)', () => {
      const ls = LabelSlot.of('category13')
      expect(ls.value).toBe('category13')
    })

    it('accepts all valid slots from category1 to category25', () => {
      for (let i = 1; i <= 25; i++) {
        expect(() => LabelSlot.of(`category${i}`)).not.toThrow()
      }
    })
  })

  describe('invalid values', () => {
    it('throws DomainException for "category0"', () => {
      expect(() => LabelSlot.of('category0')).toThrow(DomainException)
    })

    it('throws DomainException for "category26"', () => {
      expect(() => LabelSlot.of('category26')).toThrow(DomainException)
    })

    it('throws DomainException for "category"', () => {
      expect(() => LabelSlot.of('category')).toThrow(DomainException)
    })

    it('throws DomainException for empty string', () => {
      expect(() => LabelSlot.of('')).toThrow(DomainException)
    })

    it('throws DomainException for "label1"', () => {
      expect(() => LabelSlot.of('label1')).toThrow(DomainException)
    })

    it('throws DomainException for "Category1" (wrong case)', () => {
      expect(() => LabelSlot.of('Category1')).toThrow(DomainException)
    })

    it('exception has code INVALID_LABEL_SLOT', () => {
      let caught: DomainException | undefined
      try {
        LabelSlot.of('category99')
      } catch (e) {
        caught = e as DomainException
      }
      expect(caught).toBeDefined()
      expect(caught?.code).toBe('INVALID_LABEL_SLOT')
    })
  })
})
