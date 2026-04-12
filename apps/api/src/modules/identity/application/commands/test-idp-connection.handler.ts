import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import {
  DIRECTORY_PROVIDER,
  type IDirectoryProvider,
} from '../../domain/ports/directory-provider.port'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import { TestIdpConnectionCommand } from './test-idp-connection.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class IdentityProviderNotFoundException extends DomainException {
  readonly code = 'IDENTITY_PROVIDER_NOT_FOUND'
  constructor(id: string) {
    super(`Identity provider not found: ${id}`)
  }
}

export interface TestConnectionResult {
  success: boolean
  error?: string
  userCount?: number
}

@CommandHandler(TestIdpConnectionCommand)
export class TestIdpConnectionHandler implements ICommandHandler<
  TestIdpConnectionCommand,
  TestConnectionResult
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(DIRECTORY_PROVIDER)
    private readonly directoryProvider: IDirectoryProvider,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async execute(command: TestIdpConnectionCommand): Promise<TestConnectionResult> {
    const provider = await this.providerRepo.findById(command.providerId, command.tenantId)
    if (!provider) {
      throw new IdentityProviderNotFoundException(command.providerId)
    }

    const result = await this.directoryProvider.testConnection(
      provider.providerType,
      provider.clientId,
      provider.clientSecretRef,
      provider.directoryId ?? '',
    )

    await this.auditFacade.recordEvent({
      tenantId: command.tenantId,
      actorId: command.testedBy,
      eventType: 'identity_provider.connection_tested',
      module: 'identity',
      subjectId: command.providerId,
      payload: { success: result.success, error: result.error },
    })

    return result
  }
}
