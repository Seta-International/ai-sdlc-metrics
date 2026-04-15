import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { JobAssignment } from '../../domain/entities/job-assignment.entity'
import {
  JOB_ASSIGNMENT_REPOSITORY,
  type IJobAssignmentRepository,
} from '../../domain/repositories/job-assignment.repository'
import { GetCurrentJobAssignmentQuery } from './get-current-job-assignment.query'

@QueryHandler(GetCurrentJobAssignmentQuery)
export class GetCurrentJobAssignmentHandler implements IQueryHandler<
  GetCurrentJobAssignmentQuery,
  JobAssignment | null
> {
  constructor(
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly assignmentRepo: IJobAssignmentRepository,
  ) {}

  async execute(query: GetCurrentJobAssignmentQuery): Promise<JobAssignment | null> {
    return this.assignmentRepo.findCurrent(query.employmentId, query.tenantId)
  }
}
