import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  MS_LINKED_ROSTER_REPOSITORY,
  type IMsLinkedRosterRepository,
} from '../../../domain/repositories/ms-linked-roster.repository'
import { ListLinkedRostersQuery } from './list-linked-rosters.query'

export interface LinkedRosterDto {
  id: string
  msRosterId: string
  displayName: string
  syncEnabled: boolean
  mintedByFutureAt: string | null
  unlinkedAt: string | null
}

@QueryHandler(ListLinkedRostersQuery)
export class ListLinkedRostersHandler implements IQueryHandler<
  ListLinkedRostersQuery,
  LinkedRosterDto[]
> {
  constructor(
    @Inject(MS_LINKED_ROSTER_REPOSITORY)
    private readonly rosterRepo: IMsLinkedRosterRepository,
  ) {}

  async execute(query: ListLinkedRostersQuery): Promise<LinkedRosterDto[]> {
    const rosters = await this.rosterRepo.listForTenant(query.tenantId)
    return rosters.map((r) => ({
      id: r.id,
      msRosterId: r.msRosterId,
      displayName: r.displayName,
      syncEnabled: r.syncEnabled,
      mintedByFutureAt: r.mintedByFutureAt?.toISOString() ?? null,
      unlinkedAt: r.unlinkedAt?.toISOString() ?? null,
    }))
  }
}
