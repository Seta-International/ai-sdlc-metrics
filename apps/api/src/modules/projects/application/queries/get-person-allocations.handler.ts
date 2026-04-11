import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  ALLOCATION_REPOSITORY,
  type IAllocationRepository,
} from '../../domain/repositories/allocation.repository.port'
import type { Allocation } from '../../domain/entities/allocation.entity'
import { GetPersonAllocationsQuery } from './get-person-allocations.query'

@QueryHandler(GetPersonAllocationsQuery)
export class GetPersonAllocationsHandler implements IQueryHandler<
  GetPersonAllocationsQuery,
  Allocation[]
> {
  constructor(@Inject(ALLOCATION_REPOSITORY) private readonly allocRepo: IAllocationRepository) {}

  async execute(query: GetPersonAllocationsQuery): Promise<Allocation[]> {
    return this.allocRepo.findActiveByActorId(query.actorId, query.tenantId)
  }
}
