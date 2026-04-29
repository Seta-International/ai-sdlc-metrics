import { Injectable, Inject, Logger } from '@nestjs/common'
import { MsGraphClient } from '../ms-graph-client'
import { PlanIngestor } from './plan-ingestor'
import {
  MS_LINKED_ROSTER_REPOSITORY,
  type IMsLinkedRosterRepository,
} from '../../../domain/repositories/ms-linked-roster.repository'
import {
  ROSTER_MEMBER_REPOSITORY,
  type IRosterMemberRepository,
} from '../../../domain/repositories/roster-member.repository'

export interface BackfillRosterJobData {
  tenantId: string
  msRosterId: string
  linkedRosterId: string
}

@Injectable()
export class BackfillRosterWorker {
  private readonly logger = new Logger(BackfillRosterWorker.name)

  constructor(
    private readonly graph: MsGraphClient,
    private readonly ingestor: PlanIngestor,
    @Inject(MS_LINKED_ROSTER_REPOSITORY)
    private readonly rosterRepo: IMsLinkedRosterRepository,
    @Inject(ROSTER_MEMBER_REPOSITORY)
    private readonly memberRepo: IRosterMemberRepository,
  ) {}

  async run(data: BackfillRosterJobData): Promise<void> {
    const { tenantId, msRosterId, linkedRosterId } = data

    const plans = await this.graph.getAllPages<{ id: string }>(
      tenantId,
      `/planner/rosters/${encodeURIComponent(msRosterId)}/plans`,
      { useBeta: true },
    )

    for (const p of plans) {
      await this.ingestor.ingestPlan({
        tenantId,
        msPlanId: p.id,
        origin: 'ms-sync-backfill',
      })
    }

    const members = await this.graph.getAllPages<{ userId: string }>(
      tenantId,
      `/planner/rosters/${encodeURIComponent(msRosterId)}/members`,
      { useBeta: true },
    )

    await this.memberRepo.replaceForRoster({
      tenantId,
      msRosterId,
      ssoSubjects: members.map((m) => m.userId),
    })

    const roster = await this.rosterRepo.findByTenantAndRoster(tenantId, msRosterId)
    if (roster) {
      await this.rosterRepo.upsert(roster)
    }

    this.logger.log(
      `Backfill complete roster=${msRosterId} linkedRosterId=${linkedRosterId} plans=${plans.length} members=${members.length}`,
    )
  }
}
