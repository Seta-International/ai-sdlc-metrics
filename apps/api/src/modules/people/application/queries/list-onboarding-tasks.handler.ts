import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  ONBOARDING_CASE_REPOSITORY,
  type IOnboardingCaseRepository,
} from '../../domain/repositories/onboarding-case.repository'
import { ListOnboardingTasksQuery } from './list-onboarding-tasks.query'

type OnboardingTask = { id: string; status: string; isRequired: boolean }

@QueryHandler(ListOnboardingTasksQuery)
export class ListOnboardingTasksHandler implements IQueryHandler<
  ListOnboardingTasksQuery,
  OnboardingTask[]
> {
  constructor(
    @Inject(ONBOARDING_CASE_REPOSITORY)
    private readonly onboardingCaseRepo: IOnboardingCaseRepository,
  ) {}

  async execute(query: ListOnboardingTasksQuery): Promise<OnboardingTask[]> {
    return this.onboardingCaseRepo.getRequiredTasks(query.caseId, query.tenantId)
  }
}
