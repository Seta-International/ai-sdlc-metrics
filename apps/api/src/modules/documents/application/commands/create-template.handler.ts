import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { CreateTemplateCommand } from './create-template.command'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import { TEMPLATE_REPOSITORY } from '../../domain/repositories/template.repository.port'

@CommandHandler(CreateTemplateCommand)
@Injectable()
export class CreateTemplateHandler implements ICommandHandler<CreateTemplateCommand, string> {
  constructor(@Inject(TEMPLATE_REPOSITORY) private readonly templateRepo: ITemplateRepository) {}

  async execute(command: CreateTemplateCommand): Promise<string> {
    const existing = await this.templateRepo.findBySlugAndTenant(command.tenantId, command.slug)
    if (existing) {
      throw new Error(`Template slug already exists: ${command.slug}`)
    }

    const template = await this.templateRepo.insert({
      tenantId: command.tenantId,
      slug: command.slug,
      name: command.name,
      format: command.format,
      content: command.content,
      version: 1,
      isDefault: false,
      createdBy: command.createdBy,
    })

    return template.id
  }
}
