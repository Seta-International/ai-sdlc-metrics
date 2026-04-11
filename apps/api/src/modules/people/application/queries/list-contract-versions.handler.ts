import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { ListContractVersionsQuery } from './list-contract-versions.query'

@QueryHandler(ListContractVersionsQuery)
export class ListContractVersionsHandler implements IQueryHandler<
  ListContractVersionsQuery,
  never[]
> {
  async execute(_query: ListContractVersionsQuery): Promise<never[]> {
    // Contract versions not yet implemented — stub v1
    return []
  }
}
