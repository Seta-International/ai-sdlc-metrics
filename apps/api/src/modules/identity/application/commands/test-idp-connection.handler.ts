import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import {
  DIRECTORY_PROVIDER_FACTORY,
  type IDirectoryProviderFactory,
} from '../../domain/ports/directory-provider.factory.port'
import { KernelAuditService } from '../../../kernel/application/facades/kernel-audit.service'
import { IdentityProviderNotFoundException } from '../../domain/exceptions/identity.exceptions'
import { TestIdpConnectionCommand } from './test-idp-connection.command'

export interface TestIdpConnectionResult {
  success: boolean
  error?: string
  userCount?: number
}

@CommandHandler(TestIdpConnectionCommand)
export class TestIdpConnectionHandler implements ICommandHandler<
  TestIdpConnectionCommand,
  TestIdpConnectionResult
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(DIRECTORY_PROVIDER_FACTORY)
    private readonly directoryProviderFactory: IDirectoryProviderFactory,
    private readonly auditService: KernelAuditService,
  ) {}

  async execute(command: TestIdpConnectionCommand): Promise<TestIdpConnectionResult> {
    const entity = await this.providerRepo.findById(command.providerId, command.tenantId)
    if (!entity) {
      throw new IdentityProviderNotFoundException(command.providerId)
    }

    const directoryProvider = this.directoryProviderFactory.create(entity)
    const result = await directoryProvider.testConnection()

    await this.auditService.log({
      tenantId: command.tenantId,
      actorId: command.requestedBy,
      eventType: 'identity_provider.connection_tested',
      module: 'identity',
      subjectId: command.providerId,
      payload: {
        success: result.success,
        error: result.error,
        userCount: result.userCount,
      },
    })

    return result
  }
}
