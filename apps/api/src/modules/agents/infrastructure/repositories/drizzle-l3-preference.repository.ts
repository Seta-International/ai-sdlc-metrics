import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentL3Preferences } from '../schema/agents.schema'
import type { L3PreferenceRepository } from '../../domain/repositories/l3-preference.repository'

/**
 * DrizzleL3PreferenceRepository — Drizzle ORM implementation of L3PreferenceRepository.
 *
 * Uses INSERT … ON CONFLICT DO UPDATE (upsert) for set().
 * RLS tenant isolation is enforced at the DB layer via app.tenant_id session variable.
 */
@Injectable()
export class DrizzleL3PreferenceRepository implements L3PreferenceRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async set(opts: {
    tenantId: string
    userId: string
    key: string
    value: unknown
    updatedBy: string
  }): Promise<void> {
    await this.db
      .insert(agentL3Preferences)
      .values({
        tenantId: opts.tenantId,
        userId: opts.userId,
        key: opts.key,
        value: opts.value as Record<string, unknown>,
        updatedBy: opts.updatedBy,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [agentL3Preferences.tenantId, agentL3Preferences.userId, agentL3Preferences.key],
        set: {
          value: opts.value as Record<string, unknown>,
          updatedBy: opts.updatedBy,
          updatedAt: new Date(),
        },
      })
  }

  async get(opts: { tenantId: string; userId: string; key: string }): Promise<unknown | null> {
    const rows = await this.db
      .select({ value: agentL3Preferences.value })
      .from(agentL3Preferences)
      .where(
        and(
          eq(agentL3Preferences.tenantId, opts.tenantId),
          eq(agentL3Preferences.userId, opts.userId),
          eq(agentL3Preferences.key, opts.key),
        ),
      )
      .limit(1)

    return rows[0]?.value ?? null
  }

  async getAll(opts: { tenantId: string; userId: string }): Promise<Record<string, unknown>> {
    const rows = await this.db
      .select({ key: agentL3Preferences.key, value: agentL3Preferences.value })
      .from(agentL3Preferences)
      .where(
        and(
          eq(agentL3Preferences.tenantId, opts.tenantId),
          eq(agentL3Preferences.userId, opts.userId),
        ),
      )

    const result: Record<string, unknown> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }

  async delete(opts: { tenantId: string; userId: string; key?: string }): Promise<void> {
    if (opts.key !== undefined) {
      await this.db
        .delete(agentL3Preferences)
        .where(
          and(
            eq(agentL3Preferences.tenantId, opts.tenantId),
            eq(agentL3Preferences.userId, opts.userId),
            eq(agentL3Preferences.key, opts.key),
          ),
        )
    } else {
      await this.db
        .delete(agentL3Preferences)
        .where(
          and(
            eq(agentL3Preferences.tenantId, opts.tenantId),
            eq(agentL3Preferences.userId, opts.userId),
          ),
        )
    }
  }
}
