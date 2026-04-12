import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { randomBytes, createHash } from 'node:crypto'
import {
  API_KEY_REPOSITORY,
  type IApiKeyRepository,
} from '../../domain/repositories/api-key.repository'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import { CreateApiKeyCommand } from './create-api-key.command'

export interface CreateApiKeyResult {
  id: string
  plaintextKey: string
}

@CommandHandler(CreateApiKeyCommand)
export class CreateApiKeyHandler implements ICommandHandler<
  CreateApiKeyCommand,
  CreateApiKeyResult
> {
  constructor(
    @Inject(API_KEY_REPOSITORY) private readonly apiKeyRepo: IApiKeyRepository,
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: CreateApiKeyCommand): Promise<CreateApiKeyResult> {
    const plaintextKey = randomBytes(32).toString('hex')
    const keyHash = createHash('sha256').update(plaintextKey).digest('hex')
    const keyLastFour = plaintextKey.slice(-4)

    const apiKey = await this.apiKeyRepo.insert({
      tenantId: command.tenantId,
      actorId: command.actorId,
      keyHash,
      keyLastFour,
      name: command.name,
      expiresAt: command.expiresAt,
    })

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.createdBy,
      eventType: 'api_key_created',
      module: 'identity',
      subjectId: apiKey.id,
      payload: { name: command.name, actorId: command.actorId },
    })
    return { id: apiKey.id, plaintextKey }
  }
}
