import { randomUUID } from 'node:crypto'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { createMsGroupLinkedEvent } from '@future/event-contracts'
import { MsLinkedGroupEntity } from '../../../domain/entities/ms-linked-group.entity'
import {
  MS_LINKED_GROUP_REPOSITORY,
  type IMsLinkedGroupRepository,
} from '../../../domain/repositories/ms-linked-group.repository'
import { MsGraphClient } from '../../../infrastructure/ms-graph/ms-graph-client'
import { PgBossService } from '../../../../../common/jobs/pg-boss.service'
import { LinkMsGroupCommand } from './link-ms-group.command'

@CommandHandler(LinkMsGroupCommand)
export class LinkMsGroupHandler implements ICommandHandler<LinkMsGroupCommand> {
  constructor(
    private readonly graph: MsGraphClient,
    @Inject(MS_LINKED_GROUP_REPOSITORY)
    private readonly groupRepo: IMsLinkedGroupRepository,
    private readonly pgBoss: PgBossService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: LinkMsGroupCommand,
  ): Promise<{ id: string; displayName: string; backfillJobId: string }> {
    const existing = await this.groupRepo.findByTenantAndGroup(command.tenantId, command.msGroupId)
    if (existing && !existing.unlinkedAt) {
      throw new Error(`Group ${command.msGroupId} is already linked`)
    }

    const res = await this.graph.get<{ id: string; displayName: string }>(
      command.tenantId,
      `/groups/${encodeURIComponent(command.msGroupId)}?$select=id,displayName`,
    )
    if (!res.body) throw new Error('Group not found or inaccessible')

    const entity = MsLinkedGroupEntity.create({
      id: randomUUID(),
      tenantId: command.tenantId,
      msGroupId: command.msGroupId,
      displayName: res.body.displayName,
      linkedByActorId: command.actorId,
    })
    entity.startBackfill('pending')
    await this.groupRepo.upsert(entity)

    const jobId = await this.pgBoss.enqueue(
      'ms-sync-backfill-group',
      { tenantId: command.tenantId, msGroupId: command.msGroupId, linkedGroupId: entity.id },
      { singletonKey: `backfill:${command.tenantId}:${command.msGroupId}` },
    )
    entity.startBackfill(jobId)
    await this.groupRepo.upsert(entity)

    await this.eventBus.publish(
      createMsGroupLinkedEvent({
        tenantId: command.tenantId,
        msGroupId: command.msGroupId,
        actorId: command.actorId,
        occurredAt: new Date().toISOString(),
      }),
    )

    return { id: entity.id, displayName: entity.displayName, backfillJobId: jobId }
  }
}
