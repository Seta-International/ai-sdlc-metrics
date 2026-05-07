import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import type { Db } from '@future/db'
import type { AppliedChange } from '@future/event-contracts'
import { ClsService } from 'nestjs-cls'
import { BASE_DB_TOKEN } from '../../../../common/db/db.module'
import { RequestDbContextService } from '../../../../common/db/request-db-context.service'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { runWithTenantContext } from '../../../../common/jobs/run-with-tenant-context'
import {
  type GraphUserPatch,
  IdentityMsGraphCredentialFacade,
} from '../../../identity/application/facades/identity-ms-graph-credential.facade'
import { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'
import {
  PEOPLE_SYNC_PROFILE_TO_MS_REVERSAL_JOB,
  type PeopleSyncProfileToMsReversalJobPayload,
} from '../../application/event-handlers/on-profile-change-applied.handler'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'

export function buildGraphPatch(changes: AppliedChange[]): GraphUserPatch {
  const patch: GraphUserPatch = {}
  let fullName: string | undefined
  let preferredName: string | undefined

  for (const change of changes) {
    switch (change.fieldPath) {
      case 'person_profile.full_name':
        if (typeof change.newValue === 'string') {
          fullName = change.newValue
        }
        break
      case 'person_profile.preferred_name':
        if (typeof change.newValue === 'string') {
          preferredName = change.newValue
        }
        break
      case 'employment.company_email':
        if (typeof change.newValue === 'string' || change.newValue === null) {
          patch.mail = change.newValue
        }
        break
      case 'employment_detail.office_location':
        if (typeof change.newValue === 'string' || change.newValue === null) {
          patch.officeLocation = change.newValue
        }
        break
      case 'employment_detail.work_phone':
        if (typeof change.newValue === 'string') {
          patch.businessPhones = [change.newValue]
        } else if (change.newValue === null) {
          patch.businessPhones = []
        }
        break
      case 'employment_detail.personal_phone':
        if (typeof change.newValue === 'string' || change.newValue === null) {
          patch.mobilePhone = change.newValue
        }
        break
      case 'person_profile.photo_document_id':
      default:
        break
    }
  }

  if (preferredName !== undefined) {
    patch.displayName = preferredName
  } else if (fullName !== undefined) {
    patch.displayName = fullName
  }

  return patch
}

@Injectable()
export class SyncProfileToMsReversalRegistrar implements OnApplicationBootstrap {
  private readonly logger = new Logger(SyncProfileToMsReversalRegistrar.name)

  constructor(
    private readonly pgBoss: PgBossService,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly personProfileRepo: IPersonProfileRepository,
    private readonly identityFacade: IdentityQueryFacade,
    private readonly identityMsGraphCredentialFacade: IdentityMsGraphCredentialFacade,
    @Inject(BASE_DB_TOKEN) private readonly baseDb: Db,
    private readonly requestDbContext: RequestDbContextService,
    private readonly cls: ClsService,
  ) {}

  onApplicationBootstrap(): void {
    this.pgBoss.registerWorker<PeopleSyncProfileToMsReversalJobPayload>(
      PEOPLE_SYNC_PROFILE_TO_MS_REVERSAL_JOB,
      async (jobs) => {
        for (const job of jobs) {
          const { tenantId, employmentId, changes } = job.data
          this.logger.log(`Running profile MS reversal sync for tenant=${tenantId}`)
          try {
            await runWithTenantContext(
              {
                tenantId,
                baseDb: this.baseDb,
                requestDbContext: this.requestDbContext,
                cls: this.cls,
              },
              async () => {
                const employment = await this.employmentRepo.findById(employmentId, tenantId)
                if (!employment) {
                  return
                }

                const personProfile = await this.personProfileRepo.findById(
                  employment.personProfileId,
                  tenantId,
                )
                if (!personProfile) {
                  return
                }

                const msUserId = await this.identityFacade.getExternalUserId(
                  personProfile.actorId,
                  tenantId,
                )
                if (!msUserId) {
                  return
                }

                const patch = buildGraphPatch(changes)
                if (Object.keys(patch).length === 0) {
                  return
                }

                await this.identityMsGraphCredentialFacade.patchMicrosoftUser(
                  tenantId,
                  msUserId,
                  patch,
                )
              },
            )
          } catch (err) {
            this.logger.error(
              `Profile MS reversal sync failed tenant=${tenantId} employment=${employmentId}`,
              err,
            )
            throw err
          }
        }
      },
    )
    this.logger.log(`Registered worker for ${PEOPLE_SYNC_PROFILE_TO_MS_REVERSAL_JOB}`)
  }
}
