import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import { JOB_SCHEDULER, type IJobScheduler } from '../../domain/ports/job-scheduler.port'
import { TriggerDirectorySyncCommand } from './trigger-directory-sync.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class NoIdentityProviderConfiguredException extends DomainException {
  readonly code = 'NO_IDENTITY_PROVIDER_CONFIGURED'
  constructor() {
    super('No identity provider configured for this tenant')
  }
}

class SyncAlreadyRunningException extends DomainException {
  readonly code = 'SYNC_ALREADY_RUNNING'
  constructor() {
    super('Sync is already running')
  }
}

@CommandHandler(TriggerDirectorySyncCommand)
export class TriggerDirectorySyncHandler implements ICommandHandler<
  TriggerDirectorySyncCommand,
  { jobId: string }
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(JOB_SCHEDULER)
    private readonly jobScheduler: IJobScheduler,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: TriggerDirectorySyncCommand): Promise<{ jobId: string }> {
    const provider = await this.providerRepo.findPrimary(command.tenantId)
    if (!provider) {
      throw new NoIdentityProviderConfiguredException()
    }

    if (provider.syncStatus === 'running') {
      throw new SyncAlreadyRunningException()
    }

    const jobId = await this.jobScheduler.enqueueDirectorySync(command.tenantId)

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.triggeredBy,
      eventType: 'directory_sync.triggered',
      module: 'identity',
      subjectId: provider.id,
      payload: { jobId },
    })

    return { jobId }
  }
}
