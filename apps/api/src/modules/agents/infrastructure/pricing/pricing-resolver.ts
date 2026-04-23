import { Injectable, Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, lte, or, isNull, gt, desc } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentPricing } from '../schema/agents.schema'
import type { Pricing } from '../../domain/cost/cost-types'

const CACHE_TTL_MS = 60_000

interface CacheEntry {
  pricing: Pricing
  expiresAt: number
}

@Injectable()
export class PricingResolver {
  private readonly cache = new Map<string, CacheEntry>()

  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async resolve(opts: { modelId: string; at?: Date }): Promise<Pricing> {
    const isHistorical = opts.at !== undefined
    const at = opts.at ?? new Date()

    // Only cache current-time lookups. Historical `at` queries (used for audit/
    // reconciliation) must never collide with the current-pricing cache entry.
    if (!isHistorical) {
      const cached = this.cache.get(opts.modelId)
      if (cached && cached.expiresAt > Date.now()) {
        return cached.pricing
      }
    }

    const rows = await this.db
      .select()
      .from(agentPricing)
      .where(
        and(
          eq(agentPricing.modelId, opts.modelId),
          lte(agentPricing.effectiveFrom, at),
          or(isNull(agentPricing.effectiveUntil), gt(agentPricing.effectiveUntil, at)),
        ),
      )
      .orderBy(desc(agentPricing.effectiveFrom))
      .limit(1)

    const row = rows[0]
    if (!row) {
      throw new Error(`No pricing found for model ${opts.modelId} at ${at.toISOString()}`)
    }

    const pricing: Pricing = {
      pricingId: row.id,
      modelId: row.modelId,
      inputUsdPerMtok: Number(row.inputUsdPerMtok),
      inputCachedReadUsdPerMtok: Number(row.inputCachedReadUsdPerMtok),
      inputCachedWriteUsdPerMtok: Number(row.inputCachedWriteUsdPerMtok),
      outputUsdPerMtok: Number(row.outputUsdPerMtok),
      outputReasoningUsdPerMtok: Number(row.outputReasoningUsdPerMtok),
      effectiveFrom: row.effectiveFrom,
    }

    this.cache.set(opts.modelId, { pricing, expiresAt: Date.now() + CACHE_TTL_MS })
    return pricing
  }
}
