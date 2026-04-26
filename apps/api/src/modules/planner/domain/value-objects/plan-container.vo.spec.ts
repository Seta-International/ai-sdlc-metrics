import { describe, expect, it } from 'vitest'
import { DomainException } from '@future/core'
import { PlanContainer } from './plan-container.vo'

describe('PlanContainer', () => {
  describe('valid: type "future_only"', () => {
    it('accepts { type: "future_only" }', () => {
      const pc = PlanContainer.of({ type: 'future_only' })
      expect(pc.type).toBe('future_only')
    })

    it('"future_only" container has no externalId property', () => {
      const pc = PlanContainer.of({ type: 'future_only' })
      expect('externalId' in pc).toBe(false)
    })
  })

  describe('valid: type "ms_group"', () => {
    it('accepts { type: "ms_group", externalId: "g-123" }', () => {
      const pc = PlanContainer.of({ type: 'ms_group', externalId: 'g-123' })
      expect(pc.type).toBe('ms_group')
      expect((pc as { type: 'ms_group'; externalId: string }).externalId).toBe('g-123')
    })
  })

  describe('valid: type "ms_roster"', () => {
    it('accepts { type: "ms_roster", externalId: "r-456" }', () => {
      const pc = PlanContainer.of({ type: 'ms_roster', externalId: 'r-456' })
      expect(pc.type).toBe('ms_roster')
      expect((pc as { type: 'ms_roster'; externalId: string }).externalId).toBe('r-456')
    })
  })

  describe('invalid: XOR violations', () => {
    it('throws DomainException when type is "future_only" and externalId is provided', () => {
      expect(() =>
        PlanContainer.of({ type: 'future_only', externalId: 'x' } as Parameters<
          typeof PlanContainer.of
        >[0]),
      ).toThrow(DomainException)
    })

    it('throws DomainException when type is "ms_group" and externalId is missing', () => {
      expect(() =>
        PlanContainer.of({ type: 'ms_group' } as Parameters<typeof PlanContainer.of>[0]),
      ).toThrow(DomainException)
    })

    it('throws DomainException when type is "ms_roster" and externalId is missing', () => {
      expect(() =>
        PlanContainer.of({ type: 'ms_roster' } as Parameters<typeof PlanContainer.of>[0]),
      ).toThrow(DomainException)
    })

    it('throws DomainException when type is "ms_group" and externalId is empty string', () => {
      expect(() => PlanContainer.of({ type: 'ms_group', externalId: '' })).toThrow(DomainException)
    })

    it('throws DomainException when type is "ms_roster" and externalId is empty string', () => {
      expect(() => PlanContainer.of({ type: 'ms_roster', externalId: '' })).toThrow(DomainException)
    })

    it('throws DomainException for unknown type', () => {
      expect(() =>
        PlanContainer.of({ type: 'unknown' } as Parameters<typeof PlanContainer.of>[0]),
      ).toThrow(DomainException)
    })

    it('exception for "future_only" with externalId has code INVALID_PLAN_CONTAINER', () => {
      let caught: DomainException | undefined
      try {
        PlanContainer.of({ type: 'future_only', externalId: 'x' } as Parameters<
          typeof PlanContainer.of
        >[0])
      } catch (e) {
        caught = e as DomainException
      }
      expect(caught).toBeDefined()
      expect(caught?.code).toBe('INVALID_PLAN_CONTAINER')
    })

    it('exception for "ms_group" without externalId has code INVALID_PLAN_CONTAINER', () => {
      let caught: DomainException | undefined
      try {
        PlanContainer.of({ type: 'ms_group' } as Parameters<typeof PlanContainer.of>[0])
      } catch (e) {
        caught = e as DomainException
      }
      expect(caught).toBeDefined()
      expect(caught?.code).toBe('INVALID_PLAN_CONTAINER')
    })
  })
})
