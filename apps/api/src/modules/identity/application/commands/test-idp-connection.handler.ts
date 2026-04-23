import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import {
  DIRECTORY_PROVIDER_FACTORY,
  type IDirectoryProviderFactory,
} from '../../domain/ports/directory-provider.port'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import { TestIdpConnectionCommand } from './test-idp-connection.command'
import { DomainException } from '@future/core'

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
    @Inject(DIRECTORY_PROVIDER_FACTORY)
    private readonly directoryProviderFactory: IDirectoryProviderFactory,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async execute(command: TestIdpConnectionCommand): Promise<TestConnectionResult> {
    const provider = await this.providerRepo.findById(command.providerId, command.tenantId)
    if (!provider) {
      throw new IdentityProviderNotFoundException(command.providerId)
    }

    const directoryProvider = await this.directoryProviderFactory.create(provider)
    const result = await directoryProvider.testConnection()
    const response =
      result.ok === true ? { success: true } : { success: false, error: result.error }

    await this.auditFacade.recordEvent({
      tenantId: command.tenantId,
      actorId: command.testedBy,
      eventType: 'identity_provider.connection_tested',
      module: 'identity',
      subjectId: command.providerId,
      payload: { success: response.success, error: response.error },
    })

    return response
  }
}
