import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { PersonHiredEvent } from '@future/event-contracts'
import { ImportStagedMsUserCommand } from './import-staged-ms-user.command'
import {
  StagedMsUserNotFoundException,
  StagedMsUserNotPendingException,
} from '../../domain/exceptions/people.exceptions'
import {
  MS_STAGED_USER_REPOSITORY,
  type IMsStagedUserRepository,
} from '../../domain/repositories/ms-staged-user.repository'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  EMPLOYMENT_DETAIL_REPOSITORY,
  type IEmploymentDetailRepository,
} from '../../domain/repositories/employment-detail.repository'
import {
  JOB_ASSIGNMENT_REPOSITORY,
  type IJobAssignmentRepository,
} from '../../domain/repositories/job-assignment.repository'
import { KernelActorFacade } from '../../../kernel/application/facades/kernel-actor.facade'
import { KernelUserIdentityFacade } from '../../../kernel/application/facades/kernel-user-identity.facade'
import { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'

@CommandHandler(ImportStagedMsUserCommand)
export class ImportStagedMsUserHandler implements ICommandHandler<ImportStagedMsUserCommand> {
  constructor(
    @Inject(MS_STAGED_USER_REPOSITORY)
    private readonly stagedUserRepo: IMsStagedUserRepository,
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly personProfileRepo: IPersonProfileRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(EMPLOYMENT_DETAIL_REPOSITORY)
    private readonly employmentDetailRepo: IEmploymentDetailRepository,
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly jobAssignmentRepo: IJobAssignmentRepository,
    private readonly kernelActorFacade: KernelActorFacade,
    private readonly kernelUserIdentityFacade: KernelUserIdentityFacade,
    private readonly identityFacade: IdentityQueryFacade,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ImportStagedMsUserCommand): Promise<string> {
    const { tenantId, stagedUserId, importedBy } = command

    // 1. Load staged user
    const staged = await this.stagedUserRepo.findById(stagedUserId, tenantId)
    if (!staged) {
      throw new StagedMsUserNotFoundException(stagedUserId)
    }

    // 2. Guard: must be pending
    if (staged.status !== 'pending') {
      throw new StagedMsUserNotPendingException(stagedUserId, staged.status)
    }

    // 3. If an identity already exists for this AAD user, never create a duplicate actor or
    //    identity. Adopt the existing employment if present; otherwise mark as imported with no
    //    employment linkage (the person exists in the system but has no active employment).
    const existingActorId = await this.identityFacade.getActorIdByExternalUserId(
      staged.msExternalId,
      tenantId,
    )
    if (existingActorId) {
      const existingEmployment = await this.employmentRepo.findActiveByActorId(
        existingActorId,
        tenantId,
      )
      if (existingEmployment) {
        await this.stagedUserRepo.updateStatus(
          stagedUserId,
          tenantId,
          'imported',
          existingEmployment.id,
        )
        return existingEmployment.id
      }
      // Identity exists but no active employment — mark as imported to move out of pending.
      await this.stagedUserRepo.updateStatus(stagedUserId, tenantId, 'imported', undefined)
      return existingActorId
    }

    // 4. Create actor
    const actorId = await this.kernelActorFacade.createActor(
      tenantId,
      'person',
      staged.displayName,
      importedBy,
    )

    // 5. Create user identity (only when email present)
    if (staged.email) {
      await this.kernelUserIdentityFacade.createUserIdentity(
        tenantId,
        actorId,
        staged.email,
        staged.msExternalId,
        'microsoft',
      )
    }

    // 6. Insert person profile
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)

    await this.personProfileRepo.insert({
      tenantId,
      actorId,
      familyName: staged.displayName,
      middleName: null,
      givenName: staged.displayName,
      fullName: staged.displayName,
      fullNameUnaccented: staged.displayName,
      preferredName: null,
      nameDisplayOrder: 'family_first',
      dateOfBirth: null,
      gender: null,
      nationality: null,
      maritalStatus: null,
      photoDocumentId: staged.photoDocumentId,
    })

    // 7. Retrieve profile to get its id
    const profile = await this.personProfileRepo.findByActorId(actorId, tenantId)

    // 8. Insert employment
    const employment = await this.employmentRepo.insert({
      tenantId,
      personProfileId: profile!.id,
      previousProfileId: null,
      employeeCode: null,
      companyEmail: staged.email,
      workerType: 'employee',
      employmentType: 'permanent',
      countryCode: 'VN',
      employmentStatus: 'active',
      terminationDate: null,
      terminationReason: null,
      hireDate: today,
      originalHireDate: null,
    })

    // 9. Insert employment detail
    await this.employmentDetailRepo.insert({
      tenantId,
      employmentId: employment.id,
      nationalId: null,
      nationalIdType: null,
      nationalIdIssuedDate: null,
      nationalIdExpiryDate: null,
      taxId: null,
      socialInsuranceId: null,
      passportNumber: null,
      passportExpiryDate: null,
      bankAccountNumber: null,
      bankName: null,
      bankBranch: null,
      bankAccountHolder: null,
      bankSwiftCode: null,
      personalEmail: null,
      personalPhone: staged.mobilePhone,
      permanentAddress: null,
      currentAddress: null,
      emergencyContacts: null,
      countryData: null,
      customFields: null,
      officeLocation: staged.officeLocation,
      workPhone: staged.workPhone,
    })

    // 10. Insert job assignment (minimal — no job profile required for MS import)
    await this.jobAssignmentRepo.insert({
      tenantId,
      employmentId: employment.id,
      effectiveFrom: today,
      effectiveTo: null,
      jobProfileId: 'default',
      departmentId: null,
      locationId: null,
      costCenterId: null,
      workArrangement: 'onsite',
      managerId: null,
      eventType: 'hire',
      reason: 'MS365 directory import',
      createdBy: importedBy,
    })

    // 11. Mark staged user as imported
    await this.stagedUserRepo.updateStatus(stagedUserId, tenantId, 'imported', employment.id)

    // 12. Publish domain event
    this.eventBus.publish(new PersonHiredEvent(tenantId, actorId, employment.id, todayStr))

    return employment.id
  }
}
