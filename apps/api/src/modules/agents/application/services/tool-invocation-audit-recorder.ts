import { createHash } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'

import { DB_TOKEN, type DrizzleDb } from '@future/db'

import { agentToolInvocations } from '../../infrastructure/schema/agents.schema'

// ─── Constants ────────────────────────────────────────────────────────────────

const RESULT_PREVIEW_MAX_BYTES = 16_384

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordOpts {
  traceId: string
  tenantId: string
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
  constructor(@Inject(DB_TOKEN) private readonly db: DrizzleDb) {}

  async record(opts: RecordOpts): Promise<void> {
    const {
      traceId,
      tenantId,
      toolName,
      args,
      result,
      subAgentKey,
      phase,
      iteration,
      resultStatus,
    } = opts

    const serialized = JSON.stringify(result)
    const fullBuffer = Buffer.from(serialized, 'utf8')

    const resultPreview = fullBuffer.subarray(0, RESULT_PREVIEW_MAX_BYTES)
    const resultHash = 'sha256-' + createHash('sha256').update(fullBuffer).digest('hex')
    const byteCount = fullBuffer.byteLength

    await this.db.insert(agentToolInvocations).values({
      traceId,
      tenantId,
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
