import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { UpdateBrandingCommand } from './update-branding.command'
import type { ITenantBrandingRepository } from '../../domain/repositories/tenant-branding.repository.port'
import { TENANT_BRANDING_REPOSITORY } from '../../domain/repositories/tenant-branding.repository.port'

@CommandHandler(UpdateBrandingCommand)
@Injectable()
export class UpdateBrandingHandler implements ICommandHandler<UpdateBrandingCommand, string> {
  constructor(
    @Inject(TENANT_BRANDING_REPOSITORY) private readonly brandingRepo: ITenantBrandingRepository,
  ) {}

  async execute(command: UpdateBrandingCommand): Promise<string> {
    await this.brandingRepo.upsert({
      tenantId: command.tenantId,
      companyName: command.companyName,
      logoFileKey: command.logoFileKey,
      primaryColor: command.primaryColor,
      fontFamily: command.fontFamily,
      updatedAt: new Date(),
    })
    return command.tenantId
  }
}
