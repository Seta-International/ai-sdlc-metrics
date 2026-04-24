import { Injectable, Inject } from '@nestjs/common'
import {
  CANARY_QUERY_REPOSITORY,
  type CanaryQueryRepository,
  type CanaryQueryEntity,
} from '../../domain/repositories/canary-query.repository'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'

export const CANARY_QUERY_ROTATOR = Symbol('CANARY_QUERY_ROTATOR')

export type RotationResult = {
  retired: number
  ingested: number
  newQuarter: string
}

// System actor ID used for canary rotation audit events
const CANARY_SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'
const CANARY_SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001'

@Injectable()
export class CanaryQueryRotator {
  constructor(
    @Inject(CANARY_QUERY_REPOSITORY) private readonly canaryQueryRepo: CanaryQueryRepository,
    private readonly audit: KernelAuditFacade,
  ) {}

  // Retire current quarter's queries and ingest a new batch
  async rotateQuarterly(opts: {
    newQueries: Array<Omit<CanaryQueryEntity, 'id' | 'status'>>
    newQuarter: string
    retireQuarter: string
  }): Promise<RotationResult> {
    const retired = await this.canaryQueryRepo.retireByQuarter(opts.retireQuarter)

    const newEntities = opts.newQueries.map((q) => ({ ...q, status: 'active' as const }))
    const inserted = await this.canaryQueryRepo.insertBatch(newEntities)
    const ingested = inserted.length

    await this.audit.recordEvent({
      tenantId: CANARY_SYSTEM_TENANT_ID,
      actorId: CANARY_SYSTEM_ACTOR_ID,
      eventType: 'agent.canary_rotated',
      module: 'agents',
      subjectId: opts.newQuarter,
      payload: {
        retiredQuarter: opts.retireQuarter,
        newQuarter: opts.newQuarter,
        retired,
        ingested,
      },
    })

    return { retired, ingested, newQuarter: opts.newQuarter }
  }

  // Compute current quarter string like '2026-Q2'
  static currentQuarter(now: Date): string {
    const year = now.getFullYear()
    const month = now.getMonth() + 1 // 1-based
    const quarter = Math.ceil(month / 3)
    return `${year}-Q${quarter}`
  }
}
