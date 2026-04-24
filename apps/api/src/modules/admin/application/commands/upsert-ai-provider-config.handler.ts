import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { SECRETS_STORE, type ISecretsStore } from '../../domain/ports/secrets-store.port'
import { tenantAiProviderConfig } from '../../infrastructure/schema/admin.schema'
import { UpsertAiProviderConfigCommand } from './upsert-ai-provider-config.command'

@Injectable()
@CommandHandler(UpsertAiProviderConfigCommand)
export class UpsertAiProviderConfigHandler implements ICommandHandler<
  UpsertAiProviderConfigCommand,
  void
> {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(SECRETS_STORE) private readonly secretsStore: ISecretsStore,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async execute(command: UpsertAiProviderConfigCommand): Promise<void> {
    const secretName = `future/tenant/${command.tenantId}/ai-provider-api-key`
    const { ref: apiKeyRef } = await this.secretsStore.putSecret({
      name: secretName,
      value: command.rawApiKey,
    })

    const apiKeyLastFour =
      command.rawApiKey.length >= 4 ? command.rawApiKey.slice(-4) : command.rawApiKey

    await this.db
      .insert(tenantAiProviderConfig)
      .values({
        tenantId: command.tenantId,
        providerType: command.providerType,
        apiKeyRef,
        apiKeyLastFour,
        defaultReasoningModel: command.defaultReasoningModel,
        defaultClassificationModel: command.defaultClassificationModel,
        embeddingModel: command.embeddingModel,
        status: 'needs_attention',
      })
      .onConflictDoUpdate({
        target: tenantAiProviderConfig.tenantId,
        set: {
          providerType: command.providerType,
          apiKeyRef,
          apiKeyLastFour,
          defaultReasoningModel: command.defaultReasoningModel,
          defaultClassificationModel: command.defaultClassificationModel,
          embeddingModel: command.embeddingModel,
          status: 'needs_attention',
          lastError: null,
          updatedAt: new Date(),
        },
      })

    await this.auditFacade.recordEvent({
      tenantId: command.tenantId,
      actorId: command.actorId,
      eventType: 'admin.ai_config_upserted',
      module: 'admin',
      subjectId: command.tenantId,
      payload: {
        providerType: command.providerType,
        apiKeyLastFour,
      },
    })
  }
}
