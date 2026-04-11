import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { KernelModule } from '../kernel/kernel.module'
import { PeopleQueryFacade } from './application/facades/people-query.facade'
import { DrizzleEmploymentProfileRepository } from './infrastructure/repositories/drizzle-employment-profile.repository'
import { DrizzleEmploymentProfileDetailRepository } from './infrastructure/repositories/drizzle-employment-profile-detail.repository'
import { DrizzleProfileSectionRepository } from './infrastructure/repositories/drizzle-profile-section.repository'
import { DrizzleProfileChangeRequestRepository } from './infrastructure/repositories/drizzle-profile-change-request.repository'
import {
  DrizzleOffboardingCaseRepository,
  DrizzleOffboardingTemplateRepository,
} from './infrastructure/repositories/drizzle-offboarding.repository'
import { DrizzleOnboardingCaseRepository } from './infrastructure/repositories/drizzle-onboarding.repository'
import { DrizzleAccountMembershipRepository } from './infrastructure/repositories/drizzle-account-membership.repository'
import { EMPLOYMENT_PROFILE_REPOSITORY } from './domain/repositories/employment-profile.repository'
import { EMPLOYMENT_PROFILE_DETAIL_REPOSITORY } from './domain/repositories/employment-profile-detail.repository'
import { PROFILE_SECTION_REPOSITORY } from './domain/repositories/profile-section.repository'
import { PROFILE_CHANGE_REQUEST_REPOSITORY } from './domain/repositories/profile-change-request.repository'
import { OFFBOARDING_CASE_REPOSITORY } from './domain/repositories/offboarding-case.repository'
import { OFFBOARDING_TEMPLATE_REPOSITORY } from './domain/repositories/offboarding-template.repository'
import { ONBOARDING_CASE_REPOSITORY } from './domain/repositories/onboarding-case.repository'
import { ACCOUNT_MEMBERSHIP_REPOSITORY } from './domain/repositories/account-membership.repository'
import { CreateEmploymentProfileHandler } from './application/commands/create-employment-profile.handler'
import { RequestProfileChangeHandler } from './application/commands/request-profile-change.handler'
import { ApproveProfileChangeHandler } from './application/commands/approve-profile-change.handler'
import { RejectProfileChangeHandler } from './application/commands/reject-profile-change.handler'
import { UpdateProfileDirectHandler } from './application/commands/update-profile-direct.handler'
import { TriggerOffboardingHandler } from './application/commands/trigger-offboarding.handler'
import { ApproveOffboardingHandler } from './application/commands/approve-offboarding.handler'
import { RejectOffboardingHandler } from './application/commands/reject-offboarding.handler'
import { CompleteOffboardingHandler } from './application/commands/complete-offboarding.handler'
import { CompleteTaskHandler } from './application/commands/complete-task.handler'
import { OnCandidateHiredHandler } from './application/event-handlers/on-candidate-hired.handler'

@Module({
  imports: [CqrsModule, KernelModule],
  providers: [
    { provide: EMPLOYMENT_PROFILE_REPOSITORY, useClass: DrizzleEmploymentProfileRepository },
    {
      provide: EMPLOYMENT_PROFILE_DETAIL_REPOSITORY,
      useClass: DrizzleEmploymentProfileDetailRepository,
    },
    { provide: PROFILE_SECTION_REPOSITORY, useClass: DrizzleProfileSectionRepository },
    {
      provide: PROFILE_CHANGE_REQUEST_REPOSITORY,
      useClass: DrizzleProfileChangeRequestRepository,
    },
    { provide: OFFBOARDING_CASE_REPOSITORY, useClass: DrizzleOffboardingCaseRepository },
    { provide: OFFBOARDING_TEMPLATE_REPOSITORY, useClass: DrizzleOffboardingTemplateRepository },
    { provide: ONBOARDING_CASE_REPOSITORY, useClass: DrizzleOnboardingCaseRepository },
    { provide: ACCOUNT_MEMBERSHIP_REPOSITORY, useClass: DrizzleAccountMembershipRepository },
    CreateEmploymentProfileHandler,
    RequestProfileChangeHandler,
    ApproveProfileChangeHandler,
    RejectProfileChangeHandler,
    UpdateProfileDirectHandler,
    TriggerOffboardingHandler,
    ApproveOffboardingHandler,
    RejectOffboardingHandler,
    CompleteOffboardingHandler,
    CompleteTaskHandler,
    OnCandidateHiredHandler,
    PeopleQueryFacade,
  ],
  exports: [PeopleQueryFacade],
})
export class PeopleModule {}
