import { describe, expect, it, vi, beforeEach } from 'vitest'
import { PeopleMcpTools } from './people-mcp.tools'
import { Reflector } from '@nestjs/core'
import { TOOL_PERMISSION_KEY } from '../../../agents/infrastructure/guards/tool-permission.decorator'
import type { PeopleQueryFacade } from '../../application/facades/people-query.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('PeopleMcpTools', () => {
  let tools: PeopleMcpTools
  let peopleFacade: PeopleQueryFacade
  const reflector = new Reflector()

  beforeEach(() => {
    peopleFacade = { getEmploymentProfile: vi.fn() } as unknown as PeopleQueryFacade
    tools = new PeopleMcpTools(peopleFacade)
  })

  describe('metadata', () => {
    it('should have people:profile:read permission on getEmploymentProfile', () => {
      const permission = reflector.get<string>(
        TOOL_PERMISSION_KEY,
        PeopleMcpTools.prototype.getEmploymentProfile,
      )
      expect(permission).toBe('people:profile:read')
    })
  })

  describe('getEmploymentProfile', () => {
    it('should delegate to PeopleQueryFacade', async () => {
      const mockProfile = {
        id: ACTOR_ID,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        employeeCode: 'EMP001',
        status: 'active',
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(peopleFacade.getEmploymentProfile).mockResolvedValue(mockProfile as any)

      const result = await tools.getEmploymentProfile({ actorId: ACTOR_ID, tenantId: TENANT_ID })

      expect(peopleFacade.getEmploymentProfile).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID)
      expect(result).toEqual({
        content: [{ type: 'text', text: JSON.stringify(mockProfile, null, 2) }],
      })
    })

    it('should return not found message when profile does not exist', async () => {
      vi.mocked(peopleFacade.getEmploymentProfile).mockResolvedValue(null)

      const result = await tools.getEmploymentProfile({ actorId: ACTOR_ID, tenantId: TENANT_ID })

      expect(result).toEqual({
        content: [{ type: 'text', text: `Employment profile not found for actor ${ACTOR_ID}` }],
        isError: true,
      })
    })
  })
})
