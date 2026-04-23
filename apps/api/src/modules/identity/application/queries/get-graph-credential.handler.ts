import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import type { MsGraphCredentialEntity } from '../../domain/entities/ms-graph-credential.entity'
import {
  MS_GRAPH_CREDENTIAL_REPOSITORY,
  type IMsGraphCredentialRepository,
} from '../../domain/repositories/ms-graph-credential.repository'
import { GetGraphCredentialQuery } from './get-graph-credential.query'

@QueryHandler(GetGraphCredentialQuery)
export class GetGraphCredentialHandler implements IQueryHandler<GetGraphCredentialQuery> {
  constructor(
    @Inject(MS_GRAPH_CREDENTIAL_REPOSITORY)
    private readonly repo: IMsGraphCredentialRepository,
  ) {}

  execute(query: GetGraphCredentialQuery): Promise<MsGraphCredentialEntity | null> {
    return this.repo.get(query.tenantId)
  }
}
