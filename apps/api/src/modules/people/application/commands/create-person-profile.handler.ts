import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { PersonProfileAlreadyExistsException } from '../../domain/exceptions/people.exceptions'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import {
  computeFullName,
  computeFullNameUnaccented,
} from '../../domain/value-objects/name-display-order'
import type { PersonProfile } from '../../domain/entities/person-profile.entity'
import { CreatePersonProfileCommand } from './create-person-profile.command'

@CommandHandler(CreatePersonProfileCommand)
export class CreatePersonProfileHandler implements ICommandHandler<
  CreatePersonProfileCommand,
  PersonProfile
> {
  constructor(
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly personProfileRepo: IPersonProfileRepository,
  ) {}

  async execute(command: CreatePersonProfileCommand): Promise<PersonProfile> {
    const existing = await this.personProfileRepo.findByActorId(command.actorId, command.tenantId)
    if (existing) throw new PersonProfileAlreadyExistsException(command.actorId)

    const fullName = computeFullName(
      command.familyName,
      command.givenName,
      command.middleName,
      command.nameDisplayOrder,
    )
    const fullNameUnaccented = computeFullNameUnaccented(fullName)

    return this.personProfileRepo.insert({
      tenantId: command.tenantId,
      actorId: command.actorId,
      familyName: command.familyName,
      givenName: command.givenName,
      middleName: command.middleName ?? null,
      fullName,
      fullNameUnaccented,
      preferredName: command.preferredName ?? null,
      nameDisplayOrder: command.nameDisplayOrder,
      dateOfBirth: command.dateOfBirth ?? null,
      gender: command.gender ?? null,
      nationality: command.nationality ?? null,
      maritalStatus: null,
      photoDocumentId: null,
    })
  }
}
