import { Injectable, Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../common/db/db.module'
import { agentActiveTurns } from './schema/agents.schema'
import { eq } from 'drizzle-orm'

export type CrossPodCancelResult =
  | { status: 'local' } // turn is on this pod — caller should handle locally
  | { status: 'forwarded' } // forwarded to owning pod, turn ended
  | { status: 'eventual'; message: string } // forwarded failed, abort_pending=true set
  | { status: 'not_found' } // no DB row for this traceId

@Injectable()
export class CrossPodCancelService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async forwardIfNeeded(traceId: string): Promise<CrossPodCancelResult> {
    // 1. Look up row in agent_active_turn
    const rows = await this.db
      .select()
      .from(agentActiveTurns)
      .where(eq(agentActiveTurns.traceId, traceId))
      .limit(1)

    const row = rows[0]
    if (!row) return { status: 'not_found' }

    // 2. Compare pod_id
    const currentPodId = process.env['POD_ID'] ?? 'local'
    if (row.podId === currentPodId) {
      return { status: 'local' } // caller handles locally
    }

    // 3. Forward to owning pod via internal HTTP
    // In ECS, each task has a private IP; here we use pod_id as the hostname.
    // In production, POD_IP_PREFIX would be set alongside POD_ID.
    const podHost = process.env['POD_IP_PREFIX']
      ? `${process.env['POD_IP_PREFIX']}.${row.podId}`
      : row.podId

    try {
      const response = await fetch(`http://${podHost}/api/agent/turn/${traceId}/cancel`, {
        method: 'POST',
        signal: AbortSignal.timeout(3_000),
      })
      if (response.ok) {
        return { status: 'forwarded' }
      }
      // Non-2xx from remote pod — fall through to eventual
    } catch {
      // Network error — fall through to eventual
    }

    // 4. Forward failed: set abort_pending=true, let owning pod detect on next heartbeat
    await this.db
      .update(agentActiveTurns)
      .set({ abortPending: true })
      .where(eq(agentActiveTurns.traceId, traceId))

    return {
      status: 'eventual',
      message: 'Cancel forwarded asynchronously via abort_pending flag',
    }
  }
}
