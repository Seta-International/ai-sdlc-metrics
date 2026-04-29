import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { uuidv7 } from 'uuidv7'
import {
  EmploymentNotFoundException,
  PersonProfileNotFoundException,
} from '../../domain/exceptions/people.exceptions'
import type { PersonProfile } from '../../domain/entities/person-profile.entity'
import type { EmploymentDetail } from '../../domain/entities/employment-detail.entity'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import {
  EMPLOYMENT_DETAIL_REPOSITORY,
  type IEmploymentDetailRepository,
} from '../../domain/repositories/employment-detail.repository'
import { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'
import {
  PEOPLE_STORAGE_CLIENT,
  type StorageClient,
} from '../../domain/ports/people-storage-client.port'
import { SyncMicrosoftProfileCommand } from './sync-microsoft-profile.command'

export interface SyncResult {
  updatedFields: string[]
  skippedFields: string[]
}

@CommandHandler(SyncMicrosoftProfileCommand)
export class SyncMicrosoftProfileHandler implements ICommandHandler<
  SyncMicrosoftProfileCommand,
  SyncResult
> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly personProfileRepo: IPersonProfileRepository,
    @Inject(EMPLOYMENT_DETAIL_REPOSITORY)
    private readonly employmentDetailRepo: IEmploymentDetailRepository,
    private readonly identityFacade: IdentityQueryFacade,
    @Inject(PEOPLE_STORAGE_CLIENT)
    private readonly storageClient: StorageClient,
  ) {}

  async execute(command: SyncMicrosoftProfileCommand): Promise<SyncResult> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) throw new EmploymentNotFoundException(command.employmentId)

    const personProfile = await this.personProfileRepo.findById(
      employment.personProfileId,
      command.tenantId,
    )
    if (!personProfile) throw new PersonProfileNotFoundException(employment.personProfileId)

    const msData = await this.identityFacade.getMicrosoftUserData(
      personProfile.actorId,
      command.tenantId,
    )
    if (!msData) {
      return { updatedFields: [], skippedFields: [] }
    }

    const updatedFields: string[] = []
    const skippedFields: string[] = []

    const profileUpdates: Partial<
      Omit<PersonProfile, 'id' | 'tenantId' | 'actorId' | 'createdAt'>
    > = {}
    if (msData.displayName) {
      profileUpdates.fullName = msData.displayName
      profileUpdates.preferredName = msData.displayName
      updatedFields.push('fullName', 'preferredName')
    }

    if (msData.photo) {
      const photoId = uuidv7()
      const key = `people/photos/${command.tenantId}/${personProfile.id}/${photoId}.jpg`
      await this.storageClient.putObject(key, msData.photo, 'image/jpeg')
      profileUpdates.photoDocumentId = photoId
      updatedFields.push('photo')
    } else {
      skippedFields.push('photo')
    }

    if (Object.keys(profileUpdates).length > 0) {
      await this.personProfileRepo.update(personProfile.id, command.tenantId, profileUpdates)
    }

    if (msData.mail) {
      await this.employmentRepo.update(employment.id, command.tenantId, {
        companyEmail: msData.mail,
      })
      updatedFields.push('companyEmail')
    }

    const detailUpdates: Partial<Omit<EmploymentDetail, 'id' | 'tenantId' | 'employmentId'>> = {}
    if (msData.officeLocation != null) {
      detailUpdates.officeLocation = msData.officeLocation
      updatedFields.push('officeLocation')
    }
    if (msData.mobilePhone != null) {
      detailUpdates.personalPhone = msData.mobilePhone
      updatedFields.push('personalPhone')
    }
    if (msData.businessPhone != null) {
      detailUpdates.workPhone = msData.businessPhone
      updatedFields.push('workPhone')
    }

    if (Object.keys(detailUpdates).length > 0) {
      await this.employmentDetailRepo.update(employment.id, command.tenantId, detailUpdates)
    }

    return { updatedFields, skippedFields }
  }
}
