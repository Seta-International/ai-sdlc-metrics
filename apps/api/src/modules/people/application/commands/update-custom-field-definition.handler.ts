import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import type { CustomFieldDefinition } from '../../domain/entities/custom-field-definition.entity'
import {
  CUSTOM_FIELD_DEFINITION_REPOSITORY,
  type ICustomFieldDefinitionRepository,
} from '../../domain/repositories/custom-field-definition.repository'
import { UpdateCustomFieldDefinitionCommand } from './update-custom-field-definition.command'

@Injectable()
@CommandHandler(UpdateCustomFieldDefinitionCommand)
export class UpdateCustomFieldDefinitionHandler implements ICommandHandler<
  UpdateCustomFieldDefinitionCommand,
  CustomFieldDefinition
> {
  constructor(
    @Inject(CUSTOM_FIELD_DEFINITION_REPOSITORY)
    private readonly defRepo: ICustomFieldDefinitionRepository,
  ) {}

  async execute(command: UpdateCustomFieldDefinitionCommand): Promise<CustomFieldDefinition> {
    const existing = await this.defRepo.findById(command.fieldDefinitionId, command.tenantId)
    if (!existing) {
      throw new NotFoundException(`CustomFieldDefinition not found: ${command.fieldDefinitionId}`)
    }

    const payload: Partial<
      Omit<CustomFieldDefinition, 'id' | 'tenantId' | 'fieldKey' | 'createdAt'>
    > = {}

    if (command.label !== undefined) payload.label = command.label
    if (command.fieldGroup !== undefined) payload.fieldGroup = command.fieldGroup
    if (command.isRequired !== undefined) payload.isRequired = command.isRequired
    if (command.isSearchable !== undefined) payload.isSearchable = command.isSearchable
    if (command.isFilterable !== undefined) payload.isFilterable = command.isFilterable
    if (command.sortOrder !== undefined) payload.sortOrder = command.sortOrder
    if (command.validation !== undefined) payload.validation = command.validation
    if (command.options !== undefined) payload.options = command.options
    if (command.visibilityTier !== undefined) payload.visibilityTier = command.visibilityTier
    if (command.isActive !== undefined) payload.isActive = command.isActive

    return this.defRepo.update(command.fieldDefinitionId, command.tenantId, payload)
  }
}
