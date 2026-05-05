import { Inject, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  MS_PROFILE_SYNC_STATE_REPOSITORY,
  type IMsProfileSyncStateRepository,
} from '../../domain/repositories/ms-profile-sync-state.repository'
import {
  MS_STAGED_USER_REPOSITORY,
  type IMsStagedUserRepository,
} from '../../domain/repositories/ms-staged-user.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  JOB_ASSIGNMENT_REPOSITORY,
  type IJobAssignmentRepository,
} from '../../domain/repositories/job-assignment.repository'
import { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'
import { SyncMicrosoftProfileCommand } from './sync-microsoft-profile.command'
import { BulkSyncMsProfilesCommand } from './bulk-sync-ms-profiles.command'

const SYSTEM_ACTOR_ID = '00000000-0000-7000-8000-000000000000'

@CommandHandler(BulkSyncMsProfilesCommand)
export class BulkSyncMsProfilesHandler implements ICommandHandler<BulkSyncMsProfilesCommand, void> {
  private readonly logger = new Logger(BulkSyncMsProfilesHandler.name)

  constructor(
    @Inject(MS_PROFILE_SYNC_STATE_REPOSITORY)
    private readonly syncStateRepo: IMsProfileSyncStateRepository,
    @Inject(MS_STAGED_USER_REPOSITORY)
    private readonly stagedUserRepo: IMsStagedUserRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly jobAssignmentRepo: IJobAssignmentRepository,
    private readonly identityFacade: IdentityQueryFacade,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: BulkSyncMsProfilesCommand): Promise<void> {
    const { tenantId } = command

    const syncState = await this.syncStateRepo.findByTenantId(tenantId)

    const deltaResult = await this.loadDelta(tenantId, syncState?.deltaToken ?? undefined)
    if (!deltaResult) {
      this.logger.log(`MS365 not connected for tenant=${tenantId}, skipping people sync`)
      return
    }

    for (const user of deltaResult.users) {
      try {
        const actorId = await this.identityFacade.getActorIdByExternalUserId(
          user.externalId,
          tenantId,
        )

        if (!actorId) {
          await this.stagedUserRepo.upsertFromSync(tenantId, {
            msExternalId: user.externalId,
            displayName: user.displayName,
            email: user.email || null,
            jobTitle: user.jobTitle,
            department: user.department,
            officeLocation: user.officeLocation,
            mobilePhone: user.mobilePhone,
            workPhone: user.businessPhone,
            managerMsId: user.managerMsId,
            photoDocumentId: null,
          })
          continue
        }

        const employment = await this.employmentRepo.findActiveByActorId(actorId, tenantId)
        if (!employment) {
          await this.stagedUserRepo.upsertFromSync(tenantId, {
            msExternalId: user.externalId,
            displayName: user.displayName,
            email: user.email || null,
            jobTitle: user.jobTitle,
            department: user.department,
            officeLocation: user.officeLocation,
            mobilePhone: user.mobilePhone,
            workPhone: user.businessPhone,
            managerMsId: user.managerMsId,
            photoDocumentId: null,
          })
          continue
        }

        await this.commandBus.execute(
          new SyncMicrosoftProfileCommand(tenantId, employment.id, SYSTEM_ACTOR_ID),
        )

        if (user.managerMsId) {
          const managerActorId = await this.identityFacade.getActorIdByExternalUserId(
            user.managerMsId,
            tenantId,
          )
          if (managerActorId) {
            const managerEmployment = await this.employmentRepo.findActiveByActorId(
              managerActorId,
              tenantId,
            )
            if (managerEmployment) {
              await this.jobAssignmentRepo.updateManagerId(
                employment.id,
                managerEmployment.id,
                tenantId,
              )
            }
          }
        }
      } catch (err) {
        this.logger.error(
          `Failed to sync user externalId=${user.externalId} tenant=${tenantId}`,
          err,
        )
      }
    }

    for (const deletedMsId of deltaResult.deletedIds) {
      const staged = await this.stagedUserRepo.findByMsExternalId(deletedMsId, tenantId)
      if (staged && staged.status === 'pending') {
        await this.stagedUserRepo.updateStatus(staged.id, tenantId, 'skipped')
      }
    }

    await this.syncStateRepo.upsert(tenantId, deltaResult.nextDeltaToken, new Date())
  }

  private async loadDelta(tenantId: string, deltaToken: string | undefined) {
    try {
      return await this.identityFacade.listUsersDelta(tenantId, deltaToken)
    } catch (err: unknown) {
      const isGone = err instanceof Error && err.message.includes('Graph 410')
      if (isGone && deltaToken) {
        this.logger.warn(`Delta token expired for tenant=${tenantId}, resetting to full sync`)
        await this.syncStateRepo.clearDeltaToken(tenantId)
        return this.identityFacade.listUsersDelta(tenantId, undefined)
      }
      throw err
    }
  }
}
