import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { MessageFeedback } from '../../domain/entities/message-feedback'
import type { MessageFeedbackRepository } from '../../domain/repositories/message-feedback.repository'
import { agentMessageFeedback } from '../schema/agent-message-feedback.schema'

@Injectable()
export class DrizzleMessageFeedbackRepository implements MessageFeedbackRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async upsert(input: {
    tenantId: string
    messageId: string
    actorId: string
    rating: 'up' | 'down'
    note?: string | null
  }): Promise<MessageFeedback> {
    const rows = await this.db
      .insert(agentMessageFeedback)
      .values({
        tenantId: input.tenantId,
        messageId: input.messageId,
        actorId: input.actorId,
        rating: input.rating,
        note: input.note ?? null,
      })
      .onConflictDoUpdate({
        target: [
          agentMessageFeedback.tenantId,
          agentMessageFeedback.messageId,
          agentMessageFeedback.actorId,
        ],
        set: {
          rating: input.rating,
          note: input.note ?? null,
        },
      })
      .returning()

    return rows[0] as MessageFeedback
  }
}
