import { Inject } from '@nestjs/common'
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs'
import { OffboardingStartedEvent } from '@future/event-contracts'
import {
  ALLOCATION_REPOSITORY,
  type IAllocationRepository,
} from '../../domain/repositories/allocation.repository.port'

@EventsHandler(OffboardingStartedEvent)
export class OnOffboardingStartedHandler implements IEventHandler<OffboardingStartedEvent> {
  constructor(@Inject(ALLOCATION_REPOSITORY) private readonly allocRepo: IAllocationRepository) {}

  async handle(event: OffboardingStartedEvent): Promise<void> {
    // Flag confirmed allocations as tentative for allocations that overlap
    // the range [now, expectedLastDay]. The repository method filters:
    // WHERE started_at <= expectedLastDay AND (ended_at IS NULL OR ended_at >= NOW())
    await this.allocRepo.flagTentativeForActor(
      event.actorId,
      event.tenantId,
      new Date(event.expectedLastDay!),
    )
  }
}
