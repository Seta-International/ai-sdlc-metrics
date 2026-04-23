import { describe, expect, it } from 'vitest'
import { FlowIdPropagation } from './flow-id-propagation'
import type { FlowId, IntentSlug } from './flow-id-propagation'
import type { RequestContext } from './tool-gateway-contracts'

const mockContext: RequestContext = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  traceId: 'trace-1',
  surface: 'web',
}

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('FlowIdPropagation', () => {
  const propagation = new FlowIdPropagation()

  describe('mint()', () => {
    it('returns a non-empty UUIDv7 string', () => {
      const id = propagation.mint({
        requestContext: mockContext,
        intentSlug: 'draft-leave-request' as IntentSlug,
      })

      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')
      expect(UUID_V7_RE.test(id)).toBe(true)
    })

    it('returns a different ID on each call (uniqueness)', () => {
      const id1 = propagation.mint({
        requestContext: mockContext,
        intentSlug: 'draft-leave-request' as IntentSlug,
      })
      const id2 = propagation.mint({
        requestContext: mockContext,
        intentSlug: 'draft-leave-request' as IntentSlug,
      })

      expect(id1).not.toBe(id2)
    })
  })

  describe('inheritFrom()', () => {
    it('returns the same priorFlowId unchanged (identity)', () => {
      const priorFlowId = 'prior-flow-uuid-1234' as FlowId

      const result = propagation.inheritFrom({
        priorFlowId,
        requestContext: mockContext,
      })

      expect(result).toBe(priorFlowId)
    })

    it('returns different IDs for different priorFlowIds (no mixing)', () => {
      const id1 = 'flow-aaa' as FlowId
      const id2 = 'flow-bbb' as FlowId

      const result1 = propagation.inheritFrom({
        priorFlowId: id1,
        requestContext: mockContext,
      })
      const result2 = propagation.inheritFrom({
        priorFlowId: id2,
        requestContext: mockContext,
      })

      expect(result1).not.toBe(result2)
      expect(result1).toBe(id1)
      expect(result2).toBe(id2)
    })

    it('throws if priorFlowId is empty', () => {
      expect(() =>
        propagation.inheritFrom({
          priorFlowId: '' as FlowId,
          requestContext: mockContext,
        }),
      ).toThrow()
    })
  })
})
