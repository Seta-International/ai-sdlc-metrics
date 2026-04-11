import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { KernelModule } from '../kernel/kernel.module'
import { PeopleQueryFacade } from './application/facades/people-query.facade'
import { DrizzleEmploymentProfileRepository } from './infrastructure/repositories/drizzle-employment-profile.repository'
import { DrizzleEmploymentProfileDetailRepository } from './infrastructure/repositories/drizzle-employment-profile-detail.repository'
import { DrizzleProfileSectionRepository } from './infrastructure/repositories/drizzle-profile-section.repository'
import { DrizzleProfileChangeRequestRepository } from './infrastructure/repositories/drizzle-profile-change-request.repository'
import { EMPLOYMENT_PROFILE_REPOSITORY } from './domain/repositories/employment-profile.repository'
import { EMPLOYMENT_PROFILE_DETAIL_REPOSITORY } from './domain/repositories/employment-profile-detail.repository'
import { PROFILE_SECTION_REPOSITORY } from './domain/repositories/profile-section.repository'
import { PROFILE_CHANGE_REQUEST_REPOSITORY } from './domain/repositories/profile-change-request.repository'
import { CreateEmploymentProfileHandler } from './application/commands/create-employment-profile.handler'
import { RequestProfileChangeHandler } from './application/commands/request-profile-change.handler'
import { ApproveProfileChangeHandler } from './application/commands/approve-profile-change.handler'
import { RejectProfileChangeHandler } from './application/commands/reject-profile-change.handler'
import { UpdateProfileDirectHandler } from './application/commands/update-profile-direct.handler'

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
    CreateEmploymentProfileHandler,
    RequestProfileChangeHandler,
    ApproveProfileChangeHandler,
    RejectProfileChangeHandler,
    UpdateProfileDirectHandler,
    PeopleQueryFacade,
  ],
  exports: [PeopleQueryFacade],
})
export class PeopleModule {}
