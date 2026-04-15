import { Injectable } from '@nestjs/common'
import { PeopleQueryFacade } from '../../application/facades/people-query.facade'
import { ToolPermission } from '../../../agents/infrastructure/guards/tool-permission.decorator'

@Injectable()
export class PeopleMcpTools {
  constructor(private readonly peopleFacade: PeopleQueryFacade) {}

  @ToolPermission('people:profile:read')
  async getEmploymentProfile(params: {
    actorId: string
    tenantId: string
  }): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    const profile = await this.peopleFacade.getPersonProfile(params.actorId, params.tenantId)

    if (!profile) {
      return {
        content: [
          { type: 'text', text: `Employment profile not found for actor ${params.actorId}` },
        ],
        isError: true,
      }
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }],
    }
  }
}
