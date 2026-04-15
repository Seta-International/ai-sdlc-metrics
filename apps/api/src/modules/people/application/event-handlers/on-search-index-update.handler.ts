import { Injectable } from '@nestjs/common'
import { SearchIndexRebuildService } from '../services/search-index-rebuild.service'

// NOTE: The event contracts referenced in the original plan
// (JobAssignmentChangedEvent, ProfileChangeAppliedEvent, EmploymentActivatedEvent,
// EmploymentTerminatedEvent) do not yet exist in @future/event-contracts.
// The actual people events (EmployeeActivatedEvent, EmployeeTerminatedEvent,
// OrgPlacementChangedEvent) use different field shapes without employmentId.
// These handlers are declared as plain methods until the corresponding event
// contracts are added to @future/event-contracts with an employmentId field.
// TODO: Once event contracts are published, add @EventsHandler decorators and
// implement IEventHandler<T> for each method.

interface WithEmploymentAndTenant {
  employmentId: string
  tenantId: string
}

@Injectable()
export class OnSearchIndexUpdateHandler {
  constructor(private readonly rebuildService: SearchIndexRebuildService) {}

  async handleJobAssignmentChanged(event: WithEmploymentAndTenant): Promise<void> {
    await this.rebuildService.rebuildForEmployment(event.employmentId, event.tenantId)
  }

  async handleEmploymentActivated(event: WithEmploymentAndTenant): Promise<void> {
    await this.rebuildService.rebuildForEmployment(event.employmentId, event.tenantId)
  }

  async handleEmploymentTerminated(event: WithEmploymentAndTenant): Promise<void> {
    await this.rebuildService.rebuildForEmployment(event.employmentId, event.tenantId)
  }

  async handleProfileChangeApplied(event: WithEmploymentAndTenant): Promise<void> {
    await this.rebuildService.rebuildForEmployment(event.employmentId, event.tenantId)
  }
}
