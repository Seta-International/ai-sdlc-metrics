import { Buffer } from 'node:buffer'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  ContinuationBadHmac,
  ContinuationConsumed,
  ContinuationExpired,
  ContinuationUserMismatch,
} from './_errors.js'

export interface ContinuationStoreDeps {
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
  hmacKey: string
  ttlMin: number
  now?: () => number
}

export interface MintInput {
  tenantId: string
  userId: string
  toolId: string
  payload: Record<string, unknown>
  etagSnapshot: Record<string, string>
}

export interface VerifyInput {
  token: string
  userId: string
  tenantId: string
  toolId: string
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function hmac(key: string, parts: string[]): string {
  const h = createHmac('sha256', Buffer.from(key, 'hex'))
  for (const p of parts) {
    h.update(p)
    h.update('\x1f')
  }
  return b64url(h.digest())
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  const sorted = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`)
    .join(',')
  return `{${sorted}}`
}

function shaPayload(payload: unknown): string {
  return b64url(createHash('sha256').update(canonicalize(payload)).digest())
}

export function createContinuationStore(deps: ContinuationStoreDeps) {
  const now = deps.now ?? Date.now

  async function mint(input: MintInput): Promise<{ token: string; expiresAt: Date }> {
    const uuid = randomUUID()
    const sig = hmac(deps.hmacKey, [uuid, input.toolId, shaPayload(input.payload)])
    const token = `${uuid}.${sig}`
    const expiresAt = new Date(now() + deps.ttlMin * 60_000)
    await deps.sql`
      INSERT INTO planner.write_continuations
        (token, uuid, tenant_id, user_id, tool_id, payload, etag_snapshot, expires_at)
      VALUES
        (${token}, ${uuid}, ${input.tenantId}, ${input.userId}, ${input.toolId},
         ${input.payload}, ${input.etagSnapshot}, ${expiresAt})
    `
    return { token, expiresAt }
  }

  async function verify(v: VerifyInput): Promise<{
    payload: Record<string, unknown>
    etagSnapshot: Record<string, string>
  }> {
    const dotIdx = v.token.lastIndexOf('.')
    if (dotIdx < 1) throw new ContinuationBadHmac()
    const uuid = v.token.slice(0, dotIdx)
    const sig = v.token.slice(dotIdx + 1)

    const rows = await deps.sql`
      SELECT uuid, payload, etag_snapshot AS "etagSnapshot",
             result_card AS "resultCard", expires_at AS "expiresAt",
             consumed_at AS "consumedAt", user_id AS "userId", tool_id AS "toolId",
             tenant_id AS "tenantId"
      FROM planner.write_continuations
      WHERE uuid = ${uuid} AND tenant_id = ${v.tenantId}
      LIMIT 1
    `
    const row = rows[0] as
      | {
          uuid: string
          payload: Record<string, unknown>
          etagSnapshot: Record<string, string>
          resultCard: Record<string, unknown> | null
          expiresAt: Date
          consumedAt: Date | null
          userId: string
          toolId: string
          tenantId: string
        }
      | undefined
    if (!row) throw new ContinuationBadHmac()

    const expectedSig = hmac(deps.hmacKey, [row.uuid, row.toolId, shaPayload(row.payload)])
    if (sig.length !== expectedSig.length) throw new ContinuationBadHmac()
    const a = Buffer.from(sig)
    const b = Buffer.from(expectedSig)
    if (!timingSafeEqual(a, b)) throw new ContinuationBadHmac()

    if (row.consumedAt) throw new ContinuationConsumed(row.resultCard ?? undefined)
    if (row.expiresAt.getTime() < now()) throw new ContinuationExpired()
    if (row.userId !== v.userId) throw new ContinuationUserMismatch()

    return { payload: row.payload, etagSnapshot: row.etagSnapshot }
  }

  async function markConsumed(token: string, resultCard: Record<string, unknown>): Promise<void> {
    await deps.sql`
      UPDATE planner.write_continuations
      SET consumed_at = NOW(), result_card = ${resultCard}
      WHERE token = ${token} AND consumed_at IS NULL
    `
  }

  return { mint, verify, markConsumed }
}
