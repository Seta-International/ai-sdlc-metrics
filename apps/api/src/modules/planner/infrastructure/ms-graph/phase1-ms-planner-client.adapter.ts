import { Injectable } from '@nestjs/common'
import type { MsPlannerClientPort } from '../../domain/ports/ms-planner-client.port'

@Injectable()
export class Phase1MsPlannerClientAdapter implements MsPlannerClientPort {
  syncPlan(_planId: string): Promise<void> {
    throw new Error(
      'MS Planner sync not enabled in Phase 1 — wire Phase4MsPlannerClientAdapter in Phase 4',
    )
  }
}
