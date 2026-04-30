/**
 * PermissionNarrativeBuilder
 *
 * Renders a short natural-language description of what a role can/cannot do,
 * keyed by `(tenantId, roleKey)`. The result is cached content-addressably in
 * `agent_narrative_store` so identical permission sets deduplicate to a single row.
 *
 * The port uses `roleKey: string` (e.g. "employee", "manager") rather than a
 * UUID, consistent with `KernelQueryFacade.getRolePermissions(roleKey, tenantId)`.
 * The `agent_narrative_store.role_key` column stores this string value directly.
 */

import { Inject, Injectable } from '@nestjs/common'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { NarrativeStore } from '../../domain/ports/narrative-store.port'
import { NARRATIVE_STORE } from '../../domain/ports/narrative-store.port'
import { canonicalize } from '../../infrastructure/cache/canonical-args'
import { ALL_PERMISSION_KEYS } from '../../../../common/auth/permissions'
import { getPermissionVerb } from '../../../../common/auth/permission-key'
import { recordNarrativeCache } from '../../infrastructure/observability/gateway-metrics'

export const PERMISSION_NARRATIVE_BUILDER = Symbol('PERMISSION_NARRATIVE_BUILDER')

export interface BuildNarrativeOpts {
  tenantId: string
  /** Role key (e.g. "employee", "manager") — NOT a UUID. See file-level comment. */
  roleKey: string
  /** Caller's user id; required for audit attribution in the narrative store. */
  actorId: string
}

export interface BuildNarrativeResult {
  narrativeHash: string
  text: string
  fromCache: boolean
}

/**
 * Extracts the human-readable "verb" from a permission key.
 *
 * Rules:
 *  - Take the last colon- or dot-delimited segment.
 *  - Replace hyphens and underscores with spaces.
 *  - Lower-case the result.
 *
 * Examples:
 *  "planner:plan:create"          → "create"
 *  "planner:agent:list-my-tasks"  → "list my tasks"
 *  "planner.ms_sync.force_resync" → "force resync"
 *  "people:profile:self:read"     → "read"
 *  "people:admin"                 → "admin"
 */
function extractVerb(permissionKey: string): string {
  return getPermissionVerb(permissionKey)
}

/**
 * Selects the top-N verbs by frequency (distinct permission keys mapping to
 * that verb), tiebroken alphabetically ascending.
 */
function topVerbs(permissionKeys: string[], limit: number): string[] {
  const freq = new Map<string, number>()
  for (const key of permissionKeys) {
    const verb = extractVerb(key)
    freq.set(verb, (freq.get(verb) ?? 0) + 1)
  }
  return Array.from(freq.entries())
    .sort(([a, fa], [b, fb]) => {
      if (fb !== fa) return fb - fa // descending frequency
      return a < b ? -1 : a > b ? 1 : 0 // ascending alpha tiebreak
    })
    .slice(0, limit)
    .map(([verb]) => verb)
}

const TOP_N_PERMITTED = 10
const TOP_M_DENIED = 5

@Injectable()
export class PermissionNarrativeBuilder {
  constructor(
    private readonly kernelQuery: KernelQueryFacade,
    @Inject(NARRATIVE_STORE) private readonly narrativeStore: NarrativeStore,
  ) {}

  async build(opts: BuildNarrativeOpts): Promise<BuildNarrativeResult> {
    const { tenantId, roleKey, actorId } = opts

    const rolePermissionsDto = await this.kernelQuery.getRolePermissions(roleKey, tenantId)
    const grantedKeys = rolePermissionsDto.permissions.map((p) => p.permissionKey)

    const text = this.renderNarrative(roleKey, grantedKeys)

    // Canonicalize: stable hash regardless of object key ordering.
    const { hash: contentHash } = canonicalize({ text })

    // The store emits the `agent.narrative_stored` audit event on first write
    // (wasAppended: true); do not re-emit here.
    const { entry, wasAppended } = await this.narrativeStore.appendIfMissing({
      contentHash,
      tenantId,
      roleKey,
      content: text,
      actorId,
    })

    const fromCache = !wasAppended
    recordNarrativeCache(tenantId, fromCache ? 'hit' : 'miss')

    return {
      narrativeHash: entry.contentHash,
      text: entry.content,
      fromCache,
    }
  }

  private renderNarrative(roleKey: string, grantedKeys: string[]): string {
    if (grantedKeys.length === 0) {
      const deniedVerbs = topVerbs(Array.from(ALL_PERMISSION_KEYS), TOP_M_DENIED)
      const cannotPart =
        deniedVerbs.length > 0
          ? `you cannot ${deniedVerbs.join(', ')}.`
          : 'you have no granted actions.'
      return `Acting as ${roleKey}. You have no granted actions; ${cannotPart}`
    }

    // Permitted verbs: top-N by frequency across the granted set.
    const permittedVerbs = topVerbs(grantedKeys, TOP_N_PERMITTED)

    // Denied verbs: from the global catalog minus the granted set.
    const grantedSet = new Set(grantedKeys)
    const deniedKeys = Array.from(ALL_PERMISSION_KEYS).filter((k) => !grantedSet.has(k))
    const deniedVerbs = topVerbs(deniedKeys, TOP_M_DENIED)

    const canPart = `you can ${permittedVerbs.join(', ')}`
    const cannotPart = deniedVerbs.length > 0 ? `you cannot ${deniedVerbs.join(', ')}` : ''

    const body = cannotPart ? `${canPart}; ${cannotPart}.` : `${canPart}.`
    return `Acting as ${roleKey}. ${body}`
  }
}
