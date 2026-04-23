import { createHash } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'

import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'

import { agentToolInvocations } from '../../infrastructure/schema/agents.schema'

// ─── Constants ────────────────────────────────────────────────────────────────

const RESULT_PREVIEW_MAX_BYTES = 16_384

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordOpts {
  traceId: string
  tenantId: string
  userId: string
  toolName: string
  args: Record<string, unknown>
  result: unknown
  subAgentKey?: string
  phase: number
  iteration?: number
  resultStatus: string
}

// ─── ToolInvocationAuditRecorder ─────────────────────────────────────────────

@Injectable()
export class ToolInvocationAuditRecorder {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async record(opts: RecordOpts): Promise<void> {
    const {
      traceId,
      tenantId,
      userId,
      toolName,
      args,
      result,
      subAgentKey,
      phase,
      iteration,
      resultStatus,
    } = opts

    const serialized = JSON.stringify(result) ?? 'null'
    const fullBuffer = Buffer.from(serialized, 'utf8')

    const resultPreview = fullBuffer.subarray(0, RESULT_PREVIEW_MAX_BYTES)
    const resultHash = 'sha256-' + createHash('sha256').update(fullBuffer).digest('hex')
    const byteCount = fullBuffer.byteLength

    await this.db.insert(agentToolInvocations).values({
      traceId,
      tenantId,
      userId,
      toolName,
      args,
      resultPreview,
      resultHash,
      byteCount,
      resultStatus,
      subAgentKey,
      phase,
      iteration,
    })
  }
}
