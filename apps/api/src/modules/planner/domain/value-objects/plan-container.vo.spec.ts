import { describe, expect, it } from 'vitest'
import { DomainException } from '@future/core'
import { PlanContainer } from './plan-container.vo'

describe('PlanContainer', () => {
  describe('valid: type "none"', () => {
    it('accepts { type: "none" }', () => {
      const pc = PlanContainer.of({ type: 'none' })
      expect(pc.type).toBe('none')
    })

    it('"none" container has no externalId property', () => {
      const pc = PlanContainer.of({ type: 'none' })
      expect('externalId' in pc).toBe(false)
    })
  })

  describe('valid: type "group"', () => {
    it('accepts { type: "group", externalId: "g-123" }', () => {
      const pc = PlanContainer.of({ type: 'group', externalId: 'g-123' })
      expect(pc.type).toBe('group')
      expect((pc as { type: 'group'; externalId: string }).externalId).toBe('g-123')
    })
  })

  describe('valid: type "roster"', () => {
    it('accepts { type: "roster", externalId: "r-456" }', () => {
      const pc = PlanContainer.of({ type: 'roster', externalId: 'r-456' })
      expect(pc.type).toBe('roster')
      expect((pc as { type: 'roster'; externalId: string }).externalId).toBe('r-456')
    })
  })

  describe('invalid: XOR violations', () => {
    it('throws DomainException when type is "none" and externalId is provided', () => {
      expect(() =>
        PlanContainer.of({ type: 'none', externalId: 'x' } as Parameters<
          typeof PlanContainer.of
        >[0]),
      ).toThrow(DomainException)
    })

    it('throws DomainException when type is "group" and externalId is missing', () => {
      expect(() =>
        PlanContainer.of({ type: 'group' } as Parameters<typeof PlanContainer.of>[0]),
      ).toThrow(DomainException)
    })

    it('throws DomainException when type is "roster" and externalId is missing', () => {
      expect(() =>
        PlanContainer.of({ type: 'roster' } as Parameters<typeof PlanContainer.of>[0]),
      ).toThrow(DomainException)
    })

    it('throws DomainException when type is "group" and externalId is empty string', () => {
      expect(() => PlanContainer.of({ type: 'group', externalId: '' })).toThrow(DomainException)
    })

    it('throws DomainException when type is "roster" and externalId is empty string', () => {
      expect(() => PlanContainer.of({ type: 'roster', externalId: '' })).toThrow(DomainException)
    })

    it('throws DomainException for unknown type', () => {
      expect(() =>
        PlanContainer.of({ type: 'unknown' } as Parameters<typeof PlanContainer.of>[0]),
      ).toThrow(DomainException)
    })

    it('exception for "none" with externalId has code INVALID_PLAN_CONTAINER', () => {
      let caught: DomainException | undefined
      try {
        PlanContainer.of({ type: 'none', externalId: 'x' } as Parameters<
          typeof PlanContainer.of
        >[0])
      } catch (e) {
        caught = e as DomainException
      }
      expect(caught).toBeDefined()
      expect(caught?.code).toBe('INVALID_PLAN_CONTAINER')
    })

    it('exception for "group" without externalId has code INVALID_PLAN_CONTAINER', () => {
      let caught: DomainException | undefined
      try {
        PlanContainer.of({ type: 'group' } as Parameters<typeof PlanContainer.of>[0])
      } catch (e) {
        caught = e as DomainException
      }
      expect(caught).toBeDefined()
      expect(caught?.code).toBe('INVALID_PLAN_CONTAINER')
    })
  })
})
