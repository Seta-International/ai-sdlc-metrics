import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import type { CustomFieldDefinition } from '../../domain/entities/custom-field-definition.entity'
import {
  CUSTOM_FIELD_DEFINITION_REPOSITORY,
  type ICustomFieldDefinitionRepository,
} from '../../domain/repositories/custom-field-definition.repository'
import { CreateCustomFieldDefinitionCommand } from './create-custom-field-definition.command'

@Injectable()
@CommandHandler(CreateCustomFieldDefinitionCommand)
export class CreateCustomFieldDefinitionHandler implements ICommandHandler<
  CreateCustomFieldDefinitionCommand,
  CustomFieldDefinition
> {
  constructor(
    @Inject(CUSTOM_FIELD_DEFINITION_REPOSITORY)
    private readonly defRepo: ICustomFieldDefinitionRepository,
  ) {}

  async execute(command: CreateCustomFieldDefinitionCommand): Promise<CustomFieldDefinition> {
    const existing = await this.defRepo.findByFieldKey(command.fieldKey, command.tenantId)
    if (existing) {
      throw new Error('Field key already exists for this tenant')
    }

    return this.defRepo.insert({
      tenantId: command.tenantId,
      fieldKey: command.fieldKey,
      label: command.label,
      fieldType: command.fieldType,
      fieldGroup: command.fieldGroup ?? null,
      isRequired: command.isRequired ?? false,
      isSearchable: command.isSearchable ?? false,
      isFilterable: command.isFilterable ?? false,
      sortOrder: command.sortOrder ?? 0,
      validation: command.validation ?? null,
      options: command.options ?? null,
      visibilityTier: command.visibilityTier ?? 'public',
      isActive: true,
    })
  }
}
