import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { ContractVersion } from '../../domain/entities/contract-version.entity'
import { ListContractVersionsQuery } from './list-contract-versions.query'

@QueryHandler(ListContractVersionsQuery)
export class ListContractVersionsHandler implements IQueryHandler<
  ListContractVersionsQuery,
  ContractVersion[]
> {
  async execute(_query: ListContractVersionsQuery): Promise<ContractVersion[]> {
    // Contract versions not yet implemented — stub v1
    return []
  }
}
