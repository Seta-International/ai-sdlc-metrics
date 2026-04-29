import { Injectable } from '@nestjs/common'
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs'
import { DirectorySyncCompletedEvent } from '@future/event-contracts'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'

export const PEOPLE_MS_PROFILE_SYNC_JOB = 'people.ms-profile-sync'

@EventsHandler(DirectorySyncCompletedEvent)
@Injectable()
export class OnDirectorySyncCompletedListener implements IEventHandler<DirectorySyncCompletedEvent> {
  constructor(private readonly pgBoss: PgBossService) {}

  async handle(event: DirectorySyncCompletedEvent): Promise<void> {
    await this.pgBoss.enqueue(PEOPLE_MS_PROFILE_SYNC_JOB, { tenantId: event.tenantId })
  }
}
