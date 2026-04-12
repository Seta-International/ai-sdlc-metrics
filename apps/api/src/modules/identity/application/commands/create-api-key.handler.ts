import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import {
  API_KEY_REPOSITORY,
  type IApiKeyRepository,
} from '../../domain/repositories/api-key.repository'
import { CRYPTO_PROVIDER, type ICryptoProvider } from '../../domain/ports/crypto-provider.port'
import { CreateApiKeyCommand } from './create-api-key.command'

export interface CreateApiKeyResult {
  apiKeyId: string
  plaintext: string
}

@CommandHandler(CreateApiKeyCommand)
export class CreateApiKeyHandler implements ICommandHandler<
  CreateApiKeyCommand,
  CreateApiKeyResult
> {
  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepo: IApiKeyRepository,
    @Inject(CRYPTO_PROVIDER)
    private readonly cryptoProvider: ICryptoProvider,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async execute(command: CreateApiKeyCommand): Promise<CreateApiKeyResult> {
    const { plaintext, hash, lastFour } = this.cryptoProvider.generateApiKey()

    const apiKey = await this.apiKeyRepo.insert({
      tenantId: command.tenantId,
      actorId: command.actorId,
      keyHash: hash,
      keyLastFour: lastFour,
      name: command.name,
      expiresAt: command.expiresAt,
    })

    await this.auditFacade.recordEvent({
      tenantId: command.tenantId,
      actorId: command.createdBy,
      eventType: 'api_key.created',
      module: 'identity',
      subjectId: apiKey.id,
      payload: {
        name: command.name,
        systemActorId: command.actorId,
        keyLastFour: lastFour,
      },
    })

    return { apiKeyId: apiKey.id, plaintext }
  }
}
