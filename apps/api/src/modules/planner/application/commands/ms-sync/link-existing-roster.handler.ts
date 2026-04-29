import { randomUUID } from 'node:crypto'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { MsLinkedRosterEntity } from '../../../domain/entities/ms-linked-roster.entity'
import {
  MS_LINKED_ROSTER_REPOSITORY,
  type IMsLinkedRosterRepository,
} from '../../../domain/repositories/ms-linked-roster.repository'
import { MsGraphClient } from '../../../infrastructure/ms-graph/ms-graph-client'
import { PgBossService } from '../../../../../common/jobs/pg-boss.service'
import { LinkExistingRosterCommand } from './link-existing-roster.command'

@CommandHandler(LinkExistingRosterCommand)
export class LinkExistingRosterHandler implements ICommandHandler<LinkExistingRosterCommand> {
  constructor(
    private readonly graph: MsGraphClient,
    @Inject(MS_LINKED_ROSTER_REPOSITORY)
    private readonly rosterRepo: IMsLinkedRosterRepository,
    private readonly pgBoss: PgBossService,
  ) {}

  async execute(command: LinkExistingRosterCommand): Promise<{ id: string }> {
    const { tenantId, actorId, msRosterId, displayName } = command

    const res = await this.graph.get<{ id: string }>(tenantId, `/planner/rosters/${msRosterId}`, {
      useBeta: true,
    })
    if (!res.body) throw new Error('Roster not found')

    const entity = MsLinkedRosterEntity.create({
      id: randomUUID(),
      tenantId,
      msRosterId,
      displayName: displayName ?? 'Roster',
      linkedByActorId: actorId,
    })
    await this.rosterRepo.upsert(entity)

    await this.pgBoss.enqueue('ms-sync-backfill-roster', {
      tenantId,
      msRosterId,
      linkedRosterId: entity.id,
    })

    return { id: entity.id }
  }
}
