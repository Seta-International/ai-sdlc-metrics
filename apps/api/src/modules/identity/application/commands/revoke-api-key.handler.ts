import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  API_KEY_REPOSITORY,
  type IApiKeyRepository,
} from '../../domain/repositories/api-key.repository'
import { RevokeApiKeyCommand } from './revoke-api-key.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class ApiKeyNotFoundException extends DomainException {
  readonly code = 'API_KEY_NOT_FOUND'
  constructor(id: string) {
    super(`API key not found: ${id}`)
  }
}

class ApiKeyAlreadyRevokedException extends DomainException {
  readonly code = 'API_KEY_ALREADY_REVOKED'
  constructor(id: string) {
    super(`API key already revoked: ${id}`)
  }
}

@CommandHandler(RevokeApiKeyCommand)
export class RevokeApiKeyHandler implements ICommandHandler<RevokeApiKeyCommand, void> {
  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepo: IApiKeyRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: RevokeApiKeyCommand): Promise<void> {
    const apiKey = await this.apiKeyRepo.findById(command.apiKeyId, command.tenantId)
    if (!apiKey) {
      throw new ApiKeyNotFoundException(command.apiKeyId)
    }

    if (apiKey.revokedAt) {
      throw new ApiKeyAlreadyRevokedException(command.apiKeyId)
    }

    await this.apiKeyRepo.revoke(command.apiKeyId, command.tenantId)

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.revokedBy,
      eventType: 'api_key.revoked',
      module: 'identity',
      subjectId: command.apiKeyId,
      payload: { name: apiKey.name },
    })
  }
}
