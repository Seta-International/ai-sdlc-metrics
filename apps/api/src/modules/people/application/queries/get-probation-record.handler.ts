import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { ProbationRecord } from '../../domain/entities/probation-record.entity'
import {
  PROBATION_RECORD_REPOSITORY,
  type IProbationRecordRepository,
} from '../../domain/repositories/probation-record.repository'
import { GetProbationRecordQuery } from './get-probation-record.query'

@QueryHandler(GetProbationRecordQuery)
export class GetProbationRecordHandler implements IQueryHandler<
  GetProbationRecordQuery,
  ProbationRecord | null
> {
  constructor(
    @Inject(PROBATION_RECORD_REPOSITORY)
    private readonly probationRecordRepo: IProbationRecordRepository,
  ) {}

  async execute(query: GetProbationRecordQuery): Promise<ProbationRecord | null> {
    return this.probationRecordRepo.findByEmploymentId(query.employmentId, query.tenantId)
  }
}
