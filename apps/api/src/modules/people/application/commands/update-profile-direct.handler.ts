import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { EmploymentProfileNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository'
import {
  EMPLOYMENT_PROFILE_DETAIL_REPOSITORY,
  type IEmploymentProfileDetailRepository,
} from '../../domain/repositories/employment-profile-detail.repository'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import { UpdateProfileDirectCommand } from './update-profile-direct.command'
import type { EmploymentProfile } from '../../domain/entities/employment-profile.entity'

// Non-sensitive profile-level fields that can be updated directly
const PROFILE_FIELDS = new Set(['jobTitle', 'jobLevel', 'workArrangement', 'costCenter'])

// Non-sensitive detail-level fields that can be updated directly
const DETAIL_FIELDS = new Set([
  'currentAddress',
  'permanentAddress',
  'emergencyContactName',
  'emergencyContactPhone',
  'personalPhone',
  'personalEmail',
])

@CommandHandler(UpdateProfileDirectCommand)
export class UpdateProfileDirectHandler implements ICommandHandler<
  UpdateProfileDirectCommand,
  void
> {
  constructor(
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
    @Inject(EMPLOYMENT_PROFILE_DETAIL_REPOSITORY)
    private readonly detailRepo: IEmploymentProfileDetailRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: UpdateProfileDirectCommand): Promise<void> {
    // Guard: profile must exist
    const profile = await this.profileRepo.findById(command.profileId, command.tenantId)
    if (!profile) throw new EmploymentProfileNotFoundException(command.profileId)

    // Partition fields into profile-level and detail-level
    const profileFields: Partial<
      Omit<EmploymentProfile, 'id' | 'tenantId' | 'actorId' | 'createdAt'>
    > = {}
    const detailFields: Array<{ fieldName: string; value: unknown }> = []

    for (const [key, value] of Object.entries(command.fields)) {
      if (PROFILE_FIELDS.has(key)) {
        ;(profileFields as Record<string, unknown>)[key] = value
      } else if (DETAIL_FIELDS.has(key)) {
        detailFields.push({ fieldName: key, value })
      }
      // Unknown fields are silently ignored
    }

    // Apply profile-level changes
    if (Object.keys(profileFields).length > 0) {
      await this.profileRepo.update(command.profileId, command.tenantId, profileFields)
    }

    // Apply detail-level changes
    for (const { fieldName, value } of detailFields) {
      await this.detailRepo.updateField(command.profileId, command.tenantId, fieldName, value)
    }

    // Audit log
    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.updatedBy,
      eventType: 'profile_updated_direct',
      module: 'people',
      subjectId: command.profileId,
      payload: { fields: Object.keys(command.fields) },
    })
  }
}
