import { Injectable } from '@nestjs/common'
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs'
import {
  EmploymentActivatedEvent,
  JobAssignmentChangedEvent,
  EmploymentTerminatedEvent,
  PersonHiredEvent,
  ProfileChangeAppliedEvent,
} from '@future/event-contracts'
import { SearchIndexRebuildService } from '../services/search-index-rebuild.service'

type IndexUpdateEvent =
  | PersonHiredEvent
  | EmploymentActivatedEvent
  | JobAssignmentChangedEvent
  | EmploymentTerminatedEvent
  | ProfileChangeAppliedEvent

@EventsHandler(
  PersonHiredEvent,
  EmploymentActivatedEvent,
  JobAssignmentChangedEvent,
  EmploymentTerminatedEvent,
  ProfileChangeAppliedEvent,
)
@Injectable()
export class OnSearchIndexUpdateHandler implements IEventHandler<IndexUpdateEvent> {
  constructor(private readonly rebuildService: SearchIndexRebuildService) {}

  async handle(event: IndexUpdateEvent): Promise<void> {
    await this.rebuildService.rebuildForEmployment(event.employmentId, event.tenantId)
  }
}
