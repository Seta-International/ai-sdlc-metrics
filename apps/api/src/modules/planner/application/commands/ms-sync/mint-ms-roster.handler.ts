import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { uuidv7 } from 'uuidv7'
import { MsLinkedRosterEntity } from '../../../domain/entities/ms-linked-roster.entity'
import {
  MS_LINKED_ROSTER_REPOSITORY,
  type IMsLinkedRosterRepository,
} from '../../../domain/repositories/ms-linked-roster.repository'
import {
  ROSTER_MEMBER_REPOSITORY,
  type IRosterMemberRepository,
} from '../../../domain/repositories/roster-member.repository'
import { MsGraphClient } from '../../../infrastructure/ms-graph/ms-graph-client'
import { IdentityQueryFacade } from '../../../../identity/application/facades/identity-query.facade'
import { createMsRosterMintedEvent } from '@future/event-contracts'
import { MintMsRosterCommand } from './mint-ms-roster.command'

@CommandHandler(MintMsRosterCommand)
export class MintMsRosterHandler implements ICommandHandler<MintMsRosterCommand> {
  constructor(
    private readonly graph: MsGraphClient,
    @Inject(MS_LINKED_ROSTER_REPOSITORY) private readonly rosterRepo: IMsLinkedRosterRepository,
    @Inject(ROSTER_MEMBER_REPOSITORY) private readonly memberRepo: IRosterMemberRepository,
    private readonly identityFacade: IdentityQueryFacade,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: MintMsRosterCommand): Promise<{ msRosterId: string; localId: string }> {
    const ownerAadId = await this.identityFacade.getExternalUserId(cmd.actorId, cmd.tenantId)
    if (!ownerAadId) {
      throw new Error(`Cannot mint roster: actor ${cmd.actorId} has no AAD user`)
    }

    const memberAadIds: string[] = [ownerAadId]
    for (const memberActorId of cmd.initialMemberActorIds) {
      if (memberActorId === cmd.actorId) continue
      const aadId = await this.identityFacade.getExternalUserId(memberActorId, cmd.tenantId)
      if (aadId) memberAadIds.push(aadId)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rosterRes = await this.graph.post<any>(
      cmd.tenantId,
      '/planner/rosters',
      { '@odata.type': '#microsoft.graph.plannerRoster' },
      { useBeta: true, preferReturnRepresentation: true },
    )
    if (!rosterRes.body?.id) throw new Error('plannerRoster POST did not return id')
    const msRosterId = rosterRes.body.id as string

    for (const aadId of memberAadIds.slice(1)) {
      await this.graph.post(
        cmd.tenantId,
        `/planner/rosters/${encodeURIComponent(msRosterId)}/members`,
        { userId: aadId },
        { useBeta: true },
      )
    }

    const entity = MsLinkedRosterEntity.create({
      id: uuidv7(),
      tenantId: cmd.tenantId,
      msRosterId,
      displayName: cmd.displayName,
      linkedByActorId: cmd.actorId,
      mintedByFutureAt: new Date(),
    })
    await this.rosterRepo.upsert(entity)

    await this.memberRepo.replaceForRoster({
      tenantId: cmd.tenantId,
      msRosterId,
      ssoSubjects: memberAadIds,
    })

    this.eventBus.publish(
      createMsRosterMintedEvent({
        tenantId: cmd.tenantId,
        actorId: cmd.actorId,
        msRosterId,
        occurredAt: new Date().toISOString(),
      }),
    )

    return { msRosterId, localId: entity.id }
  }
}
