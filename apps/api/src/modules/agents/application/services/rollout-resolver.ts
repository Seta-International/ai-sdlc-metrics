import { createHash } from 'crypto'
import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentRolloutConfig } from '../../infrastructure/schema/agents.schema'

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface ResolveVersionResult {
  version: string
  fromCandidate: boolean
  rolloutConfigId: string | null
}

export interface ResolveVersionOpts {
  changeClass: 'router' | 'planner' | 'model' | 'tool_meta' | 'sub_agent_prompt'
  tenantId: string
  /** Required when changeClass is 'sub_agent_prompt'. Used as part of stability key. */
  userId?: string
  /** pg-boss retry sticky version: bypasses hash logic and returns this version verbatim. */
  retryContextVersion?: string
}

// ─── Hash routing ─────────────────────────────────────────────────────────────

/**
 * Deterministic hash-based routing.
 *
 * Computes sha256(rolloutConfigId + ':' + stabilityKeyValue), reads the first
 * 4 bytes as a big-endian uint32, mods by 100. Returns true if the result is
 * strictly less than trafficPercentage — i.e. the key is in the candidate bucket.
 */
function shouldRouteToCandidate(
  rolloutConfigId: string,
  stabilityKeyValue: string,
  trafficPercentage: number,
): boolean {
  const digest = createHash('sha256').update(`${rolloutConfigId}:${stabilityKeyValue}`).digest()
  const uint32 = digest.readUInt32BE(0)
  const bucket = uint32 % 100
  return bucket < trafficPercentage
}

// ─── RolloutResolver ──────────────────────────────────────────────────────────

/**
 * Plan 11 — Resolves which version (baseline vs candidate) a given tenant/user
 * receives for a specific change class.
 *
 * Stability key rules (§14):
 *   - changeClass === 'sub_agent_prompt' → stabilityKey = tenantId + userId
 *   - all other classes                  → stabilityKey = tenantId
 *
 * Safe fallback (§13 Backout): when no active rollout exists, always return
 * the baseline version so rollouts are opt-in and easily reversed.
 */
@Injectable()
export class RolloutResolver {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async resolveVersion(opts: ResolveVersionOpts): Promise<ResolveVersionResult> {
    const { changeClass, tenantId, userId, retryContextVersion } = opts

    // Query DB for the active rollout config for this tenant + changeClass.
    // Always fetch so retryContextVersion can include the rolloutConfigId.
    const [config] = await this.db
      .select()
      .from(agentRolloutConfig)
      .where(
        and(
          eq(agentRolloutConfig.tenantId, tenantId),
          eq(agentRolloutConfig.status, 'active'),
          eq(agentRolloutConfig.changeClass, changeClass),
        ),
      )

    // ── pg-boss retry bypass (§5) ──────────────────────────────────────────
    // Sticky version: if the caller passes retryContextVersion, return it verbatim.
    // The rolloutConfigId is included from the live config if present.
    if (retryContextVersion !== undefined) {
      const fromCandidate = config ? retryContextVersion === config.candidateVersion : false
      return {
        version: retryContextVersion,
        fromCandidate,
        rolloutConfigId: config ? config.id : null,
      }
    }

    // ── No active rollout → safe baseline fallback (§13) ──────────────────
    if (!config) {
      return { version: 'baseline', fromCandidate: false, rolloutConfigId: null }
    }

    // ── Compute stability key ─────────────────────────────────────────────
    const stabilityKeyValue =
      changeClass === 'sub_agent_prompt' ? `${tenantId}${userId ?? ''}` : tenantId

    // ── Hash-based deterministic routing ─────────────────────────────────
    const trafficPct = Number(config.trafficPercentage)
    const isCandidate = shouldRouteToCandidate(config.id, stabilityKeyValue, trafficPct)

    return {
      version: isCandidate ? config.candidateVersion : config.baselineVersion,
      fromCandidate: isCandidate,
      rolloutConfigId: config.id,
    }
  }
}
