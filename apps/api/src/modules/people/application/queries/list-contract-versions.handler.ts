import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { ContractVersion } from '../../domain/entities/contract-version.entity'
import {
  CONTRACT_VERSION_REPOSITORY,
  type IContractVersionRepository,
} from '../../domain/repositories/contract-version.repository'
import { ListContractVersionsQuery } from './list-contract-versions.query'

@QueryHandler(ListContractVersionsQuery)
export class ListContractVersionsHandler implements IQueryHandler<
  ListContractVersionsQuery,
  ContractVersion[]
> {
  constructor(
    @Inject(CONTRACT_VERSION_REPOSITORY)
    private readonly contractVersionRepo: IContractVersionRepository,
  ) {}

  async execute(query: ListContractVersionsQuery): Promise<ContractVersion[]> {
    return this.contractVersionRepo.findByEmploymentId(query.employmentId, query.tenantId)
  }
}
