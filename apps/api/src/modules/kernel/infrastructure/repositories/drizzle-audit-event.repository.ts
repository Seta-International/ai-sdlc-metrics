import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import type { IAuditEventRepository } from '../../domain/repositories/audit-event.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { auditEvent } from '../schema/index'

@Injectable()
export class DrizzleAuditEventRepository implements IAuditEventRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(data: {
    tenantId: string
    actorId: string
    eventType: string
    module: string
    subjectId: string
    payload: unknown
  }): Promise<void> {
    await this.db.insert(auditEvent).values({
      tenantId: data.tenantId,
      actorId: data.actorId,
      eventType: data.eventType,
      module: data.module,
      subjectId: data.subjectId,
      payload: data.payload,
    })
  }
}
